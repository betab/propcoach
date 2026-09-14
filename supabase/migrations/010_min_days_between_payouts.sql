-- 010_min_days_between_payouts.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Tradeify Select's dual Daily/Flex path structure (already modeled as two
-- separate version_keys, select_daily/select_flex, with their own drawdown/
-- DLL/payout numbers) also differs in payout *cadence*: the Daily path
-- allows a payout request every day, the Flex path only every 5 days. That
-- gap isn't captured anywhere yet — payoutEligible only checks balance,
-- consistency, and qualifying days, never how recently the last payout was.
--
-- min_days_between_payouts = 0 (every existing firm/size) means no gate —
-- no regression. A firm/size with e.g. 5 here blocks payoutEligible until
-- at least that many days have passed since the account's last recorded
-- payout (see payouts.recorded_at, already populated on every payout).
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE firm_rule_sizes
  ADD COLUMN min_days_between_payouts INTEGER NOT NULL DEFAULT 0;
