-- 021_daily_target_multiplier.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Per-account "Daily Target Risk" slider (Settings decision, 2026-09-22): the
-- coaching card's Daily Target currently shows a flat ~$300 baseline for
-- every account regardless of size (see lib/firms/shared/coaching.ts, fixed
-- in #56 to at least be internally consistent, but still flat). This column
-- lets a trader scale that number up or down per account.
--
-- 0.5x-2.0x in 0.25 steps (0.5/0.75/1.0/1.25/1.5/1.75/2.0), 1.0 = neutral
-- default, applied on top of a new account-size-scaled base target
-- (lib/firms/shared/coaching.ts, follow-on PR) — this migration is schema
-- only, the coaching-math change ships separately.
--
-- Self-writable directly by the owning trader, same additive-GRANT pattern
-- as avatar_url (012) and rules (013) layering onto the accounts
-- column-lockdown from 013_rules.sql: a live-adjustable coaching preference
-- with no effect on firm-rule resolution, so no need to route through the
-- validated POST /api/accounts flow the way size/firm_id/drawdown_type do.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE accounts
  ADD COLUMN daily_target_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.0
  CHECK (daily_target_multiplier BETWEEN 0.5 AND 2.0);

GRANT UPDATE (daily_target_multiplier) ON accounts TO authenticated;
