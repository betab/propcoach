// app/api/cron/firm-rules-ingest/route.ts
// The monitoring pipeline's landing point (see supabase/migrations/
// 003_firm_rules_db.sql and lib/admin-proposals.ts). A biweekly research
// Routine (Claude Code Remote, configured separately — see the milestone
// plan) POSTs what it found published for a firm's rules here; this route
// is what actually decides whether that's a real change and, if so, queues
// a pending proposal for a human admin to approve or reject. NEVER writes
// firm_rule_sizes/versions/firms directly — see lib/admin-proposals.ts for
// why, and app/api/admin/proposals/[id]/approve/route.ts for the only path
// that does.
//
// Auth: a shared secret, not a user session — this is called by a Routine,
// not a logged-in admin. Requires the FIRM_RULES_INGEST_SECRET env var
// (not yet set anywhere — a manual Vercel step, same as
// SUPABASE_SERVICE_ROLE_KEY was for PR6).
//
// Request contract — POST, Authorization: Bearer <FIRM_RULES_INGEST_SECRET>,
// JSON body:
//   {
//     runType?: 'biweekly_auto' | 'manual',   // default 'biweekly_auto'
//     summary?: string,                        // free-text run summary
//     findings: [
//       {
//         // Applies to an EXISTING firm_rule_sizes row:
//         proposalType: 'update_existing',
//         firmId: string,
//         versionKey: string,
//         accountSize: number,
//         drawdownType: 'trailing_eod' | 'trailing_intraday' | 'static',
//         proposed: { ...any of SIZE_EDITABLE_COLUMNS, e.g. drawdown_amount, max_contracts },
//         sourceUrl?: string, sourceExcerpt?: string, confidence?: 'high'|'medium'|'low',
//       }
//       // OR a brand-new size for an existing version:
//       | { proposalType: 'new_size', firmId: string, proposed: { version_key, account_size, drawdown_type, ... }, ... }
//       // OR a brand-new version for an existing firm:
//       | { proposalType: 'new_version', firmId: string, data: { version_key, version_label, is_current?, sizes?: [...] }, ... }
//       // OR a brand-new firm entirely:
//       | { proposalType: 'new_firm', data: { id, name, logo_url?, is_active?, coming_soon?, versions?: [...] }, ... }
//     ]
//   }
//
// This route re-verifies every "existing" claim against the live DB (never
// trusts the Routine's own diff or its claim that something is new) and
// only ever queues a proposal for a GENUINE difference — see
// computeSizeFieldDiffs in lib/admin-proposals.ts. It also skips a finding
// if an equivalent proposal is already pending, so a Routine re-reporting
// the same unreviewed finding every two weeks doesn't spam the queue.
//
// new_version/new_size/new_firm findings get the same two-layer dedup:
// skipped if the thing being "discovered" already exists in the live DB
// (e.g. a version/size that was approved since the Routine's last run), and
// skipped if an equivalent proposal is already pending review. A Routine
// session never has its own DB access — it can only re-report the same
// discovery every run — so without this it would spam a fresh duplicate
// proposal forever instead of going quiet once the real one lands.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeSizeFieldDiffs } from '@/lib/admin-proposals'

type DrawdownType = 'trailing_eod' | 'trailing_intraday' | 'static'

interface FindingInput {
  proposalType: 'update_existing' | 'new_size' | 'new_version' | 'new_firm'
  firmId: string
  versionKey?: string
  accountSize?: number
  drawdownType?: DrawdownType
  proposed?: Record<string, any>
  data?: Record<string, any>
  sourceUrl?: string
  sourceExcerpt?: string
  confidence?: 'high' | 'medium' | 'low'
  proposedEffectiveFrom?: string
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  const secret = process.env.FIRM_RULES_INGEST_SECRET
  if (!secret) {
    // Fail closed — an unset secret must never silently accept every request.
    return NextResponse.json({ error: 'Ingest endpoint is not configured.' }, { status: 503 })
  }
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader !== `Bearer ${secret}`) return unauthorized()

  let body: { runType?: string; summary?: string; findings?: FindingInput[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const runType = body.runType === 'manual' ? 'manual' : 'biweekly_auto'
  const findings = Array.isArray(body.findings) ? body.findings : []
  if (findings.length === 0) {
    return NextResponse.json({ error: 'findings must be a non-empty array.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: run, error: runError } = await admin
    .from('firm_rule_check_runs')
    .insert({ run_type: runType, status: 'running', summary: body.summary || null })
    .select('id').single()
  if (runError || !run) {
    return NextResponse.json({ error: runError?.message || 'Could not start a check run.' }, { status: 500 })
  }

  const firmsChecked = new Set<string>()
  const created: string[] = []
  const skipped: { firmId: string; reason: string }[] = []
  const errors: { firmId: string; error: string }[] = []

  for (const finding of findings) {
    const firmId = String(finding.firmId || '')
    if (!firmId) {
      errors.push({ firmId: '', error: 'Missing firmId.' })
      continue
    }
    firmsChecked.add(firmId)

    try {
      if (finding.proposalType === 'update_existing') {
        if (!finding.versionKey || !finding.accountSize || !finding.drawdownType || !finding.proposed) {
          errors.push({ firmId, error: 'update_existing requires versionKey, accountSize, drawdownType, and proposed.' })
          continue
        }
        const { data: version } = await admin
          .from('firm_rule_versions').select('id')
          .eq('firm_id', firmId).eq('version_key', finding.versionKey).maybeSingle()
        if (!version) {
          errors.push({ firmId, error: `No rule version '${finding.versionKey}' found — did you mean proposalType 'new_version'?` })
          continue
        }
        const { data: sizeRow } = await admin
          .from('firm_rule_sizes').select('*')
          .eq('firm_version_id', version.id)
          .eq('account_size', finding.accountSize)
          .eq('drawdown_type', finding.drawdownType)
          .is('effective_to', null)
          .maybeSingle()
        if (!sizeRow) {
          errors.push({ firmId, error: `No current rule row for $${finding.accountSize} ${finding.drawdownType} — did you mean proposalType 'new_size'?` })
          continue
        }

        const fieldDiffs = computeSizeFieldDiffs(sizeRow, finding.proposed)
        if (Object.keys(fieldDiffs).length === 0) {
          skipped.push({ firmId, reason: `No genuine change detected for $${finding.accountSize} ${finding.drawdownType}.` })
          continue
        }

        const { data: existingPending } = await admin
          .from('firm_rule_change_proposals')
          .select('id')
          .eq('firm_rule_size_id', sizeRow.id)
          .eq('status', 'pending')
          .maybeSingle()
        if (existingPending) {
          skipped.push({ firmId, reason: `A pending proposal already exists for $${finding.accountSize} ${finding.drawdownType}.` })
          continue
        }

        const { data: proposal, error } = await admin.from('firm_rule_change_proposals').insert({
          run_id: run.id,
          firm_id: firmId,
          firm_rule_size_id: sizeRow.id,
          proposal_type: 'update_existing',
          field_diffs: fieldDiffs,
          source_url: finding.sourceUrl || null,
          source_excerpt: finding.sourceExcerpt || null,
          confidence: finding.confidence || null,
          proposed_effective_from: finding.proposedEffectiveFrom || null,
        }).select('id').single()
        if (error) { errors.push({ firmId, error: error.message }); continue }
        created.push(proposal.id)
      } else if (finding.proposalType === 'new_size' || finding.proposalType === 'new_version' || finding.proposalType === 'new_firm') {
        const proposedData = finding.proposalType === 'new_size' ? finding.proposed : finding.data
        if (!proposedData) {
          errors.push({ firmId, error: `${finding.proposalType} requires ${finding.proposalType === 'new_size' ? 'proposed' : 'data'}.` })
          continue
        }

        // Unlike update_existing, a "new" finding has no natural row to key a
        // duplicate check off of — without this, a Routine that re-discovers
        // the same new plan/size every biweekly run (because it has no DB
        // access of its own to know it was already proposed or approved)
        // would insert a fresh duplicate proposal forever, burying real
        // signal in repeat noise.
        if (finding.proposalType === 'new_version') {
          const versionKey = String(proposedData.version_key || '')
          if (!versionKey) {
            errors.push({ firmId, error: 'new_version requires data.version_key.' })
            continue
          }
          const { data: existingVersion, error: existingVersionError } = await admin
            .from('firm_rule_versions').select('id')
            .eq('firm_id', firmId).eq('version_key', versionKey).maybeSingle()
          if (existingVersionError) {
            errors.push({ firmId, error: `Could not verify version '${versionKey}' isn't already tracked: ${existingVersionError.message}` })
            continue
          }
          if (existingVersion) {
            skipped.push({ firmId, reason: `Version '${versionKey}' already exists — nothing to propose.` })
            continue
          }
          const { data: existingPending, error: existingPendingError } = await admin
            .from('firm_rule_change_proposals')
            .select('id')
            .eq('firm_id', firmId).eq('proposal_type', 'new_version').eq('status', 'pending')
            .eq('proposed_data->>version_key', versionKey)
            .maybeSingle()
          if (existingPendingError) {
            errors.push({ firmId, error: `Could not verify no pending 'new_version' proposal exists for '${versionKey}': ${existingPendingError.message}` })
            continue
          }
          if (existingPending) {
            skipped.push({ firmId, reason: `A pending 'new_version' proposal for '${versionKey}' already exists.` })
            continue
          }
        }

        if (finding.proposalType === 'new_size') {
          const versionKey = String(proposedData.version_key || '')
          const accountSize = Number(proposedData.account_size)
          const drawdownType = String(proposedData.drawdown_type || '')
          if (!versionKey || !accountSize || !drawdownType) {
            errors.push({ firmId, error: 'new_size requires proposed.version_key, account_size, and drawdown_type.' })
            continue
          }
          const { data: version, error: versionError } = await admin
            .from('firm_rule_versions').select('id')
            .eq('firm_id', firmId).eq('version_key', versionKey).maybeSingle()
          if (versionError) {
            errors.push({ firmId, error: `Could not look up version '${versionKey}': ${versionError.message}` })
            continue
          }
          if (version) {
            const { data: existingSize, error: existingSizeError } = await admin
              .from('firm_rule_sizes').select('id')
              .eq('firm_version_id', version.id).eq('account_size', accountSize).eq('drawdown_type', drawdownType)
              .is('effective_to', null)
              .maybeSingle()
            if (existingSizeError) {
              errors.push({ firmId, error: `Could not verify $${accountSize} ${drawdownType} isn't already tracked: ${existingSizeError.message}` })
              continue
            }
            if (existingSize) {
              skipped.push({ firmId, reason: `$${accountSize} ${drawdownType} already exists for version '${versionKey}' — did you mean 'update_existing'?` })
              continue
            }
          }
          const { data: existingPending, error: existingPendingError } = await admin
            .from('firm_rule_change_proposals')
            .select('id')
            .eq('firm_id', firmId).eq('proposal_type', 'new_size').eq('status', 'pending')
            .eq('proposed_data->>version_key', versionKey)
            .eq('proposed_data->>account_size', String(accountSize))
            .eq('proposed_data->>drawdown_type', drawdownType)
            .maybeSingle()
          if (existingPendingError) {
            errors.push({ firmId, error: `Could not verify no pending 'new_size' proposal exists for $${accountSize} ${drawdownType}: ${existingPendingError.message}` })
            continue
          }
          if (existingPending) {
            skipped.push({ firmId, reason: `A pending 'new_size' proposal for $${accountSize} ${drawdownType} (version '${versionKey}') already exists.` })
            continue
          }
        }

        if (finding.proposalType === 'new_firm') {
          const { data: existingFirm, error: existingFirmError } = await admin.from('firms').select('id').eq('id', firmId).maybeSingle()
          if (existingFirmError) {
            errors.push({ firmId, error: `Could not verify firm '${firmId}' doesn't already exist: ${existingFirmError.message}` })
            continue
          }
          if (existingFirm) {
            skipped.push({ firmId, reason: `Firm '${firmId}' already exists — nothing to propose.` })
            continue
          }
          const { data: existingPending, error: existingPendingError } = await admin
            .from('firm_rule_change_proposals')
            .select('id')
            .eq('firm_id', firmId).eq('proposal_type', 'new_firm').eq('status', 'pending')
            .maybeSingle()
          if (existingPendingError) {
            errors.push({ firmId, error: `Could not verify no pending 'new_firm' proposal exists for '${firmId}': ${existingPendingError.message}` })
            continue
          }
          if (existingPending) {
            skipped.push({ firmId, reason: `A pending 'new_firm' proposal for '${firmId}' already exists.` })
            continue
          }
        }

        const { data: proposal, error } = await admin.from('firm_rule_change_proposals').insert({
          run_id: run.id,
          firm_id: firmId,
          proposal_type: finding.proposalType,
          proposed_data: proposedData,
          source_url: finding.sourceUrl || null,
          source_excerpt: finding.sourceExcerpt || null,
          confidence: finding.confidence || null,
          proposed_effective_from: finding.proposedEffectiveFrom || null,
        }).select('id').single()
        if (error) { errors.push({ firmId, error: error.message }); continue }
        created.push(proposal.id)
      } else {
        errors.push({ firmId, error: `Unknown proposalType: ${finding.proposalType}` })
      }
    } catch (e) {
      errors.push({ firmId, error: e instanceof Error ? e.message : String(e) })
    }
  }

  await admin.from('firm_rule_check_runs').update({
    finished_at: new Date().toISOString(),
    firms_checked: Array.from(firmsChecked),
    proposals_created: created.length,
    status: errors.length > 0 && created.length === 0 && skipped.length === 0 ? 'failed' : 'completed',
    error_message: errors.length > 0 ? errors.map(e => `${e.firmId}: ${e.error}`).join('; ') : null,
  }).eq('id', run.id)

  return NextResponse.json({
    runId: run.id,
    proposalsCreated: created.length,
    proposalIds: created,
    skipped,
    errors,
  })
}
