// lib/admin-proposals.ts
// Shared logic for turning firm_rule_change_proposals rows into real
// changes — both the ingest route (app/api/cron/firm-rules-ingest, which
// INSERTs pending proposals after diffing a finding against the live DB)
// and the approve route (which applies an already-reviewed proposal) live
// here, so both sides agree on what a "diff" is and what a proposal's
// payload shape means. Nothing here ever writes firm_rule_sizes without
// going through the same close-out-then-insert pattern as the admin
// supersede route (never a raw UPDATE of a numeric column) — that applies
// equally to a human-approved change and a monitoring-detected one.
//
// Payload contract for proposal rows:
//
//   update_existing: firm_rule_size_id is set, field_diffs = { column: { old, new } }
//     where column is one of SIZE_EDITABLE_COLUMNS below.
//   new_size:    proposed_data = { version_key, ...sizeFields }
//   new_version: proposed_data = { version_key, version_label, is_current?, sizes?: [sizeFields] }
//   new_firm:    proposed_data = { id, name, logo_url?, is_active?, coming_soon?,
//                                   versions?: [{ version_key, version_label, is_current?, sizes?: [sizeFields] }] }
//
//   sizeFields = { account_size, drawdown_type, drawdown_amount, daily_loss_limit,
//     optional_daily_loss_limit?, scale_dll_pct?, safety_net_buffer, mll_lock_buffer,
//     qualifying_day_min, min_qualifying_days, max_contracts, consistency_rule_pct,
//     consistency_schedule?, payout_ladder, min_payout, min_days_between_payouts,
//     extra?, effective_from? }

import type { SupabaseClient } from '@supabase/supabase-js'

// Baseline/onboarding data (new_size, new_version, new_firm — "here's this
// plan's current numbers") defaults to this sentinel instead of the
// approval date, matching the convention 003_firm_rules_db.sql's own seed
// INSERTs already use for Apex/TopStep: "these are the current rules,
// treat them as having been true all along" rather than "these rules
// started being true today." Without this, any trader whose real account
// start_date predates the day an admin happened to enter a firm's data
// gets an account with nothing to resolve against — the exact bug this
// constant was added to close off for good, not just patch once.
// update_existing keeps using the real approval/admin-chosen date — that
// path represents an actual point-in-time rule change, not baseline data.
export const NEW_DATA_SENTINEL_EFFECTIVE_FROM = '2020-01-01'

export const SIZE_EDITABLE_COLUMNS = [
  'drawdown_amount', 'daily_loss_limit', 'optional_daily_loss_limit', 'scale_dll_pct', 'safety_net_buffer', 'mll_lock_buffer',
  'qualifying_day_min', 'min_qualifying_days', 'max_contracts', 'consistency_rule_pct', 'consistency_schedule',
  'payout_ladder', 'min_payout', 'min_days_between_payouts', 'requires_minimum_balance', 'extra',
] as const

export function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

// Normalizes one SIZE_EDITABLE_COLUMNS value the same way regardless of
// which side (an old DB row vs. a freshly-submitted finding) it came from,
// so the two are safe to compare — array/object columns need JSON
// equality, not ===, and daily_loss_limit's "no DLL" is null, not 0.
function normalizeSizeColumn(col: (typeof SIZE_EDITABLE_COLUMNS)[number], v: unknown): unknown {
  switch (col) {
    case 'payout_ladder':
      return Array.isArray(v) ? v.map(n => num(n)) : []
    case 'consistency_schedule':
      // Nullable array, unlike payout_ladder — null/[] both mean "no
      // escalation, use the flat consistency_rule_pct" and must compare equal.
      return Array.isArray(v) && v.length > 0 ? v.map(n => num(n)) : null
    case 'extra':
      return v && typeof v === 'object' ? v : {}
    case 'daily_loss_limit':
    case 'optional_daily_loss_limit':
    case 'scale_dll_pct':
      return v == null || v === '' ? null : num(v)
    case 'requires_minimum_balance':
      // NOT NULL DEFAULT TRUE — absent/undefined normalizes to true, same
      // as the column's own default, not to false like num(v) would.
      return !(v === false || v === 'false' || v === 0)
    default:
      return num(v)
  }
}

/**
 * Compares a live firm_rule_sizes row against a finding's proposed values,
 * column by column, and returns only the columns that actually differ —
 * the ingest route must never trust a monitoring source's self-reported
 * diff (see supabase/migrations/003_firm_rules_db.sql), this is what makes
 * that true. Columns absent from `proposed` are left alone (not a "no
 * change" claim — the finding just didn't report them).
 */
export function computeSizeFieldDiffs(
  oldRow: Record<string, any>,
  proposed: Record<string, any>
): Record<string, { old: unknown; new: unknown }> {
  const diffs: Record<string, { old: unknown; new: unknown }> = {}
  for (const col of SIZE_EDITABLE_COLUMNS) {
    if (!(col in proposed)) continue
    const oldNormalized = normalizeSizeColumn(col, oldRow[col])
    const newNormalized = normalizeSizeColumn(col, proposed[col])
    const changed = col === 'payout_ladder' || col === 'extra' || col === 'consistency_schedule'
      ? JSON.stringify(oldNormalized) !== JSON.stringify(newNormalized)
      : oldNormalized !== newNormalized
    if (changed) diffs[col] = { old: oldRow[col], new: newNormalized }
  }
  return diffs
}

function normalizeSizeInput(data: Record<string, any>, effectiveFrom: string) {
  return {
    account_size:         num(data.account_size),
    drawdown_type:        String(data.drawdown_type || ''),
    drawdown_amount:      num(data.drawdown_amount),
    daily_loss_limit:     data.daily_loss_limit == null || data.daily_loss_limit === '' ? null : num(data.daily_loss_limit),
    optional_daily_loss_limit: data.optional_daily_loss_limit == null || data.optional_daily_loss_limit === '' ? null : num(data.optional_daily_loss_limit),
    scale_dll_pct:        data.scale_dll_pct == null || data.scale_dll_pct === '' ? null : num(data.scale_dll_pct),
    safety_net_buffer:    num(data.safety_net_buffer, 100),
    mll_lock_buffer:      num(data.mll_lock_buffer, 100),
    qualifying_day_min:   num(data.qualifying_day_min, 0),
    min_qualifying_days:  num(data.min_qualifying_days, 0),
    max_contracts:        num(data.max_contracts),
    consistency_rule_pct: num(data.consistency_rule_pct, 0),
    consistency_schedule: Array.isArray(data.consistency_schedule) && data.consistency_schedule.length > 0
      ? data.consistency_schedule.map((n: unknown) => num(n)) : null,
    payout_ladder:        Array.isArray(data.payout_ladder) ? data.payout_ladder.map((n: unknown) => num(n)) : [],
    min_payout:           num(data.min_payout, 0),
    min_days_between_payouts: num(data.min_days_between_payouts, 0),
    requires_minimum_balance: !(data.requires_minimum_balance === false || data.requires_minimum_balance === 'false' || data.requires_minimum_balance === 0),
    extra:                data.extra && typeof data.extra === 'object' ? data.extra : {},
    effective_from:       data.effective_from || effectiveFrom,
  }
}

// Refuses a would-be duplicate the same way POST /api/admin/firm-rule-sizes
// already does for direct admin entry — a second open-ended row for the
// same (version, size, drawdown_type) key makes effective-date resolution
// ambiguous (resolveFirmRuleSize's "most recent effective_from wins"
// tiebreak just silently picks one, masking the duplicate instead of
// erroring). applyProposal's new_size case never had this guard, which is
// exactly how Lucid/Tradeify Lightning ended up with real production
// duplicates — a correction proposal that should have been update_existing
// got submitted as new_size instead and nothing caught it.
// Returns `error` when the existence check itself couldn't be trusted (a
// failed query), distinct from `exists: false` (query succeeded, genuinely
// no open row). Collapsing those into one boolean is exactly what let a
// transient query failure fail OPEN instead of closed here before: `data`
// comes back undefined on error same as on a real "not found", so `!!data`
// silently reports "no open row" either way — the wrong default for a
// guard whose entire job is to block a duplicate insert.
async function hasOpenRow(
  supabase: SupabaseClient,
  firmVersionId: string,
  accountSize: number,
  drawdownType: string
): Promise<{ exists: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('firm_rule_sizes')
    .select('id')
    .eq('firm_version_id', firmVersionId)
    .eq('account_size', accountSize)
    .eq('drawdown_type', drawdownType)
    .is('effective_to', null)
    .maybeSingle()
  if (error) return { exists: false, error: error.message }
  return { exists: !!data }
}

export interface ProposalRow {
  id: string
  firm_id: string
  firm_rule_size_id: string | null
  proposal_type: 'update_existing' | 'new_size' | 'new_version' | 'new_firm'
  field_diffs: Record<string, { old: unknown; new: unknown }>
  proposed_data: Record<string, any> | null
}

/**
 * Applies an approved proposal's data changes. Returns { error } on failure;
 * each branch either fully succeeds or compensates (same pattern as the
 * supersede route) rather than leaving a partial write. Does NOT touch the
 * proposal row itself — the caller marks it approved/reviewed afterward.
 */
export async function applyProposal(
  supabase: SupabaseClient,
  proposal: ProposalRow,
  effectiveFrom: string,
  userId: string
): Promise<{ error?: string }> {
  switch (proposal.proposal_type) {
    case 'update_existing': {
      if (!proposal.firm_rule_size_id) return { error: 'Missing firm_rule_size_id for an update_existing proposal.' }
      const { data: oldRow } = await supabase.from('firm_rule_sizes').select('*').eq('id', proposal.firm_rule_size_id).single()
      if (!oldRow) return { error: 'The rule row this proposal targets no longer exists.' }
      if (oldRow.effective_to) return { error: 'The rule row this proposal targets has already been superseded.' }
      if (effectiveFrom <= oldRow.effective_from) {
        return { error: `Effective date must be after the current row's effective date (${oldRow.effective_from}).` }
      }

      const merged: Record<string, any> = {}
      for (const col of SIZE_EDITABLE_COLUMNS) {
        merged[col] = col in (proposal.field_diffs || {}) ? proposal.field_diffs[col].new : oldRow[col]
      }

      // .select() here isn't cosmetic: without it, a 0-row update (e.g. an
      // RLS policy silently filtering it out) reports no error at all —
      // that's exactly how every supersession's close-out went unnoticed
      // before 016_firm_rule_sizes_update_policy.sql added the missing
      // UPDATE policy. Checking the returned rows is what makes this fail
      // loudly instead of silently leaving the old row open forever.
      const { data: closedRows, error: closeError } = await supabase
        .from('firm_rule_sizes').update({ effective_to: effectiveFrom }).eq('id', oldRow.id)
        .select('id')
      if (closeError) return { error: closeError.message }
      if (!closedRows || closedRows.length === 0) {
        return { error: 'Closing the current row affected 0 rows — check RLS UPDATE policy on firm_rule_sizes.' }
      }

      const { error: insertError } = await supabase.from('firm_rule_sizes').insert({
        firm_version_id: oldRow.firm_version_id,
        account_size: oldRow.account_size,
        drawdown_type: oldRow.drawdown_type,
        ...merged,
        effective_from: effectiveFrom,
        created_by: userId,
      })
      if (insertError) {
        // Compensate: reopen the old row rather than leave a coverage gap.
        await supabase.from('firm_rule_sizes').update({ effective_to: null }).eq('id', oldRow.id)
        return { error: insertError.message }
      }
      return {}
    }

    case 'new_size': {
      const data = proposal.proposed_data
      if (!data?.version_key) return { error: 'proposed_data.version_key is required for a new_size proposal.' }
      const { data: version } = await supabase
        .from('firm_rule_versions').select('id')
        .eq('firm_id', proposal.firm_id).eq('version_key', data.version_key).maybeSingle()
      if (!version) return { error: `No rule version '${data.version_key}' found for this firm.` }

      const row = normalizeSizeInput(data, effectiveFrom)
      if (!row.account_size || !row.drawdown_type) return { error: 'proposed_data must include account_size and drawdown_type.' }

      const openCheck = await hasOpenRow(supabase, version.id, row.account_size, row.drawdown_type)
      if (openCheck.error) return { error: `Could not verify there's no existing row: ${openCheck.error}` }
      if (openCheck.exists) {
        return {
          error: `A current row already exists for $${row.account_size} ${row.drawdown_type} on this version — ` +
            `this should be an "update existing" proposal, not "new size". Reject this one and correct the existing row instead.`,
        }
      }

      const { error } = await supabase.from('firm_rule_sizes').insert({ firm_version_id: version.id, ...row, created_by: userId })
      return error ? { error: error.message } : {}
    }

    case 'new_version': {
      const data = proposal.proposed_data
      if (!data?.version_key || !data?.version_label) {
        return { error: 'proposed_data must include version_key and version_label for a new_version proposal.' }
      }
      const { data: newVersion, error: versionError } = await supabase
        .from('firm_rule_versions')
        .insert({
          firm_id: proposal.firm_id, version_key: data.version_key,
          version_label: data.version_label, is_current: data.is_current !== false,
          created_by: userId,
        })
        .select('id').single()
      if (versionError) return { error: versionError.message }

      for (const s of Array.isArray(data.sizes) ? data.sizes : []) {
        const row = normalizeSizeInput(s, effectiveFrom)
        if (!row.account_size || !row.drawdown_type) {
          return { error: 'Version created, but one of proposed_data.sizes is missing account_size or drawdown_type.' }
        }
        // Defense in depth: newVersion.id was just created above, so this
        // can only trip on a malformed payload listing the same size twice
        // — but it's the same cheap check as new_size, so no reason to skip it.
        const openCheck = await hasOpenRow(supabase, newVersion.id, row.account_size, row.drawdown_type)
        if (openCheck.error) return { error: `Version created, but couldn't verify $${row.account_size} ${row.drawdown_type} isn't a duplicate: ${openCheck.error}` }
        if (openCheck.exists) {
          return { error: `Version created, but proposed_data.sizes lists $${row.account_size} ${row.drawdown_type} more than once.` }
        }
        const { error } = await supabase.from('firm_rule_sizes').insert({ firm_version_id: newVersion.id, ...row, created_by: userId })
        if (error) return { error: `Version created, but a size row failed: ${error.message}` }
      }
      return {}
    }

    case 'new_firm': {
      const data = proposal.proposed_data
      if (!data?.id || !data?.name) return { error: 'proposed_data must include id and name for a new_firm proposal.' }

      const { error: firmError } = await supabase.from('firms').insert({
        id: data.id, name: data.name, logo_url: data.logo_url || null,
        is_active: data.is_active ?? false, coming_soon: data.coming_soon ?? true,
      })
      if (firmError) {
        // 23505 = unique_violation. A duplicate new_firm proposal for the
        // same id (e.g. two submissions before either was reviewed) hits
        // firms_pkey here — give a clear, actionable message instead of
        // the raw Postgres error.
        if (firmError.code === '23505') {
          return { error: `A firm with id '${data.id}' already exists — reject this proposal instead; it's a duplicate.` }
        }
        return { error: firmError.message }
      }

      for (const v of Array.isArray(data.versions) ? data.versions : []) {
        if (!v.version_key || !v.version_label) continue
        const { data: newVersion, error: versionError } = await supabase
          .from('firm_rule_versions')
          .insert({ firm_id: data.id, version_key: v.version_key, version_label: v.version_label, is_current: v.is_current !== false, created_by: userId })
          .select('id').single()
        if (versionError) return { error: `Firm created, but a version failed: ${versionError.message}` }

        for (const s of Array.isArray(v.sizes) ? v.sizes : []) {
          const row = normalizeSizeInput(s, effectiveFrom)
          if (!row.account_size || !row.drawdown_type) {
            return { error: 'Firm/version created, but one of a version\'s sizes is missing account_size or drawdown_type.' }
          }
          const openCheck = await hasOpenRow(supabase, newVersion.id, row.account_size, row.drawdown_type)
          if (openCheck.error) return { error: `Firm/version created, but couldn't verify $${row.account_size} ${row.drawdown_type} isn't a duplicate: ${openCheck.error}` }
          if (openCheck.exists) {
            return { error: `Firm/version created, but a version's sizes list $${row.account_size} ${row.drawdown_type} more than once.` }
          }
          const { error } = await supabase.from('firm_rule_sizes').insert({ firm_version_id: newVersion.id, ...row, created_by: userId })
          if (error) return { error: `Firm/version created, but a size row failed: ${error.message}` }
        }
      }
      return {}
    }

    default:
      return { error: `Unknown proposal type: ${proposal.proposal_type}` }
  }
}
