// lib/firms/db.ts
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the old hardcoded FIRM_REGISTRY (lib/firms/apex/*, lib/firms/topstep/*)
// with reads against the DB tables added in supabase/migrations/003_firm_rules_db.sql.
//
// firm_rule_sizes is effective-dated and append-only (see that migration's
// comments) — resolution is always "what rules were in effect as of a given
// date," via resolveFirmRuleSize() below. There is no snapshot/FK on accounts;
// an account's math can legitimately shift if a later admin edit backdates a
// correction. getFirmConfigForAccount() resolves "as of account.start_date";
// getCurrentFirmConfig() resolves "as of today" (used by the new-account flow
// to preview numbers before an account exists).
//
// Deliberately NOT using unstable_cache here yet — correctness first. Caching
// is a reasonable follow-up once this is proven live, not something to get
// subtly wrong (e.g. leaking a per-request client's scope into a shared
// cache) while wiring up the first real consumer of this table.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AccountConfig, DrawdownType, FirmMeta, FirmVersion } from './types'

type FirmRuleSizeRow = {
  account_size:         number
  drawdown_type:        DrawdownType
  drawdown_amount:      number | string
  daily_loss_limit:     number | string | null
  optional_daily_loss_limit: number | string | null
  scale_dll_pct:        number | string | null
  safety_net_buffer:    number | string
  mll_lock_buffer:      number | string
  qualifying_day_min:   number | string
  min_qualifying_days:  number
  max_contracts:        number
  consistency_rule_pct: number | string
  consistency_schedule: (number | string)[] | null
  payout_ladder:        (number | string)[] | null
  min_payout:           number | string
}

function buildConfig(
  row: FirmRuleSizeRow,
  firmId: string,
  firmName: string,
  firmLogo: string,
  dllEnabled: boolean = false
): AccountConfig {
  const size           = row.account_size
  const drawdownAmount = Number(row.drawdown_amount)
  const baseDll        = row.daily_loss_limit == null ? null : Number(row.daily_loss_limit)
  const optionalDll    = row.optional_daily_loss_limit == null ? null : Number(row.optional_daily_loss_limit)
  return {
    firmId,
    firmName,
    firmLogo,
    accountSize:       size,
    drawdownType:      row.drawdown_type,
    drawdownAmount,
    startingMLL:       size - drawdownAmount,
    safetyNet:         size + drawdownAmount + Number(row.safety_net_buffer),
    mllLockAt:         size + Number(row.mll_lock_buffer),
    // The account's opt-in choice (accounts.daily_loss_limit_enabled) swaps
    // in the optional DLL amount when set — everything downstream of this
    // function (derive.ts, coaching.ts, account pages) just sees the final
    // effective number and never needs to know the toggle exists.
    dailyLossLimit:    dllEnabled && optionalDll != null ? optionalDll : baseDll,
    optionalDailyLossLimit: optionalDll,
    scaleDllPct:       row.scale_dll_pct == null ? null : Number(row.scale_dll_pct),
    qualifyingDayMin:  Number(row.qualifying_day_min),
    minQualifyingDays: row.min_qualifying_days,
    maxContracts:      row.max_contracts,
    consistencyRule:   Number(row.consistency_rule_pct),
    consistencyRuleSchedule: row.consistency_schedule && row.consistency_schedule.length > 0
      ? row.consistency_schedule.map(Number) : null,
    payoutLadder:      (row.payout_ladder || []).map(Number),
    minPayout:         Number(row.min_payout),
  }
}

// Resolves the firm_rule_sizes row in effect for (firm, version, size, type)
// as of a given date — the one shared lookup both public functions use.
async function resolveFirmRuleSize(
  supabase: SupabaseClient,
  firmId: string,
  versionKey: string,
  size: number,
  drawdownType: DrawdownType,
  asOfDate: string
): Promise<FirmRuleSizeRow | null> {
  const { data: version } = await supabase
    .from('firm_rule_versions')
    .select('id')
    .eq('firm_id', firmId)
    .eq('version_key', versionKey)
    .maybeSingle()
  if (!version) return null

  const { data: row } = await supabase
    .from('firm_rule_sizes')
    .select('*')
    .eq('firm_version_id', version.id)
    .eq('account_size', size)
    .eq('drawdown_type', drawdownType)
    .lte('effective_from', asOfDate)
    .or(`effective_to.is.null,effective_to.gt.${asOfDate}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle()

  return row as FirmRuleSizeRow | null
}

async function getFirmMeta(supabase: SupabaseClient, firmId: string) {
  const { data } = await supabase.from('firms').select('name, logo_url').eq('id', firmId).single()
  return { name: data?.name || firmId, logo: data?.logo_url || '' }
}

/** Resolve config for an EXISTING account, as of its own start_date. */
export async function getFirmConfigForAccount(
  supabase: SupabaseClient,
  account: { firm_id: string; size: number; drawdown_type: DrawdownType; version: string; start_date: string; daily_loss_limit_enabled?: boolean }
): Promise<AccountConfig> {
  const [firm, row] = await Promise.all([
    getFirmMeta(supabase, account.firm_id),
    resolveFirmRuleSize(supabase, account.firm_id, account.version, account.size, account.drawdown_type, account.start_date),
  ])
  if (!row) {
    throw new Error(
      `No rules found for ${account.firm_id} ${account.version} $${account.size} ${account.drawdown_type} as of ${account.start_date}`
    )
  }
  return buildConfig(row, account.firm_id, firm.name, firm.logo, account.daily_loss_limit_enabled ?? false)
}

/** Resolve the CURRENT config for a firm/size/type/version, as of today — used by the new-account flow. */
export async function getCurrentFirmConfig(
  supabase: SupabaseClient,
  firmId: string,
  size: number,
  drawdownType: DrawdownType,
  versionKey: string,
  dllEnabled: boolean = false
): Promise<AccountConfig> {
  const today = new Date().toISOString().slice(0, 10)
  const [firm, row] = await Promise.all([
    getFirmMeta(supabase, firmId),
    resolveFirmRuleSize(supabase, firmId, versionKey, size, drawdownType, today),
  ])
  if (!row) {
    throw new Error(`No current rules found for ${firmId} ${versionKey} $${size} ${drawdownType}`)
  }
  return buildConfig(row, firmId, firm.name, firm.logo, dllEnabled)
}

export async function getAllFirms(supabase: SupabaseClient): Promise<FirmMeta[]> {
  const { data } = await supabase.from('firms').select('*').order('name')
  return (data || []).map(f => ({
    id:         f.id,
    name:       f.name,
    logo:       f.logo_url || '',
    isActive:   f.is_active,
    comingSoon: f.coming_soon,
  }))
}

export async function getActiveFirms(supabase: SupabaseClient): Promise<FirmMeta[]> {
  const all = await getAllFirms(supabase)
  return all.filter(f => f.isActive)
}

export async function getFirmVersions(supabase: SupabaseClient, firmId: string): Promise<FirmVersion[]> {
  const { data } = await supabase
    .from('firm_rule_versions')
    .select('version_key, version_label')
    .eq('firm_id', firmId)
  return (data || []).map(v => ({ key: v.version_key, label: v.version_label }))
}

/** Sizes currently offered (effective_to IS NULL — still open-ended) for a firm/version. */
export async function getAvailableSizes(supabase: SupabaseClient, firmId: string, versionKey: string): Promise<number[]> {
  const { data: version } = await supabase
    .from('firm_rule_versions')
    .select('id')
    .eq('firm_id', firmId)
    .eq('version_key', versionKey)
    .maybeSingle()
  if (!version) return []

  const { data } = await supabase
    .from('firm_rule_sizes')
    .select('account_size')
    .eq('firm_version_id', version.id)
    .is('effective_to', null)

  const sizes = Array.from(new Set((data || []).map(r => r.account_size as number)))
  return sizes.sort((a, b) => a - b)
}
