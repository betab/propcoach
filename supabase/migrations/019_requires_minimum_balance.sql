-- 019_requires_minimum_balance.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- derive.ts's payoutEligible has always required balance - safetyNet >=
-- minPayout for every firm/plan — a reasonable default, but wrong for
-- Tradeify Select Flex specifically. Per Tradeify's own help center
-- (Select Flex and Select Daily Payout Policies): "Unlike other Tradeify
-- programs, Select Flex has no minimum account balance requirement for
-- payouts. You can request a payout immediately after achieving 5 winning
-- days, regardless of your account balance." A Select Flex account can hit
-- its 5-winning-day requirement (qualifyingDayMin's threshold × 5) while
-- still sitting below the standard safetyNet figure, and PropCoach would
-- incorrectly show it as not payout-eligible.
--
-- requires_minimum_balance = true (every existing firm/size) preserves
-- today's behavior exactly — this is an opt-OUT flag, not a new
-- requirement anyone has to configure. See the accompanying derive.ts
-- change for how it's used.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE firm_rule_sizes
  ADD COLUMN requires_minimum_balance BOOLEAN NOT NULL DEFAULT TRUE;
