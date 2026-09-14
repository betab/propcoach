-- 009_consistency_schedule.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Tradeify Lightning's escalating consistency rule: starts at 20%, rises to
-- 25% after the first payout, then 30% after the second (per WebSearch
-- research — not yet primary-source confirmed, same caveat as when this was
-- first flagged during Lightning's onboarding).
--
-- consistency_schedule mirrors payout_ladder's existing "index by payout
-- number, clamp at the last entry" pattern exactly: [20, 25, 30] means
-- payout 0 = 20%, payout 1 = 25%, payout 2+ = 30%. NULL/empty (every
-- existing firm/size) means no escalation — the flat consistency_rule_pct
-- column keeps meaning what it always has.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE firm_rule_sizes
  ADD COLUMN consistency_schedule NUMERIC(5,2)[];
