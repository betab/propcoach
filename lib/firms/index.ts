// lib/firms/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Firm rules are now DB-backed (see supabase/migrations/003_firm_rules_db.sql
// and lib/firms/db.ts) instead of hardcoded per-firm TypeScript modules.
// Adding a new firm (e.g. Tradeify, Lucid) is now a data-entry task via the
// admin dashboard — no code change needed here.
//
// derive()/buildCoaching() are shared, firm-agnostic math — every firm uses
// the same implementation, parameterized by whatever AccountConfig comes
// back from the DB lookups below.
// ─────────────────────────────────────────────────────────────────────────────

export {
  getFirmConfigForAccount,
  getCurrentFirmConfig,
  getAllFirms,
  getActiveFirms,
  getFirmVersions,
  getAvailableSizes,
} from './db'

export { derive, deriveBalanceHistory } from './shared/derive'
export { buildCoaching, getConsistencyBreachMultiplier } from './shared/coaching'
