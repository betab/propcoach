// lib/admin-proposals.ts
// Shared logic for approving a firm_rule_change_proposals row — the
// human-in-the-loop gate the monitoring pipeline (a later PR) will write
// into. Nothing here is called by that pipeline; it only ever INSERTs
// pending proposals. This is the other half: turning an approved proposal
// into the same append-only firm_rule_sizes writes an admin would make by
// hand (see app/api/admin/firm-rule-sizes/[id]/supersede/route.ts) — never
// a raw UPDATE of a numeric column, for the same reason that route isn't
// one either.
//
// Payload contract for proposal rows — defined here since nothing produces
// them yet; a later ingest route must conform to this:
//
//   update_existing: firm_rule_size_id is set, field_diffs = { column: { old, new } }
//     where column is one of SIZE_EDITABLE_COLUMNS below.
//   new_size:    proposed_data = { version_key, ...sizeFields }
//   new_version: proposed_data = { version_key, version_label, is_current?, sizes?: [sizeFields] }
//   new_firm:    proposed_data = { id, name, logo_url?, is_active?, coming_soon?,
//                                   versions?: [{ version_key, version_label, is_current?, sizes?: [sizeFields] }] }
//
//   sizeFields = { account_size, drawdown_type, drawdown_amount, daily_loss_limit,
//     safety_net_buffer, mll_lock_buffer, qualifying_day_min, min_qualifying_days,
//     max_contracts, consistency_rule_pct, payout_ladder, min_payout, extra?, effective_from? }

import type { SupabaseClient } from '@supabase/supabase-js'

const SIZE_EDITABLE_COLUMNS = [
  'drawdown_amount', 'daily_loss_limit', 'safety_net_buffer', 'mll_lock_buffer',
  'qualifying_day_min', 'min_qualifying_days', 'max_contracts', 'consistency_rule_pct',
  'payout_ladder', 'min_payout', 'extra',
] as const

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return isNaN(n) ? fallback : n
}

function normalizeSizeInput(data: Record<string, any>, effectiveFrom: string) {
  return {
    account_size:         num(data.account_size),
    drawdown_type:        String(data.drawdown_type || ''),
    drawdown_amount:      num(data.drawdown_amount),
    daily_loss_limit:     data.daily_loss_limit == null || data.daily_loss_limit === '' ? null : num(data.daily_loss_limit),
    safety_net_buffer:    num(data.safety_net_buffer, 100),
    mll_lock_buffer:      num(data.mll_lock_buffer, 100),
    qualifying_day_min:   num(data.qualifying_day_min, 0),
    min_qualifying_days:  num(data.min_qualifying_days, 0),
    max_contracts:        num(data.max_contracts),
    consistency_rule_pct: num(data.consistency_rule_pct, 0),
    payout_ladder:        Array.isArray(data.payout_ladder) ? data.payout_ladder.map((n: unknown) => num(n)) : [],
    min_payout:           num(data.min_payout, 0),
    extra:                data.extra && typeof data.extra === 'object' ? data.extra : {},
    effective_from:       data.effective_from || effectiveFrom,
  }
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

      const { error: closeError } = await supabase
        .from('firm_rule_sizes').update({ effective_to: effectiveFrom }).eq('id', oldRow.id)
      if (closeError) return { error: closeError.message }

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
      if (firmError) return { error: firmError.message }

      for (const v of Array.isArray(data.versions) ? data.versions : []) {
        if (!v.version_key || !v.version_label) continue
        const { data: newVersion, error: versionError } = await supabase
          .from('firm_rule_versions')
          .insert({ firm_id: data.id, version_key: v.version_key, version_label: v.version_label, is_current: v.is_current !== false, created_by: userId })
          .select('id').single()
        if (versionError) return { error: `Firm created, but a version failed: ${versionError.message}` }

        for (const s of Array.isArray(v.sizes) ? v.sizes : []) {
          const row = normalizeSizeInput(s, effectiveFrom)
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
