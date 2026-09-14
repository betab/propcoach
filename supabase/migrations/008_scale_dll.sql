-- 008_scale_dll.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Lucid Trading's "LucidScale DLL" — confirmed directly from Lucid's own
-- Funded Rules pages (owner-provided screenshots): once an account's
-- trailing MLL locks (balance has risen enough that the floor stops
-- moving — Lucid calls this point "Above Initial Trail"; PropCoach already
-- models the identical threshold as mllLockAt/mllLocked, confirmed
-- equivalent by Lucid's own wording elsewhere: "once the account exceeds
-- the Initial Trail Balance, the MLL locks and no longer moves"), the
-- fixed-dollar daily loss limit is replaced by a PERCENTAGE of the
-- account's peak EOD balance — 60% for every Lucid plan/size that has it.
--
-- This is NOT another optional_daily_loss_limit-shaped field: it's a
-- dynamic number that changes as peak balance changes, not a fixed dollar
-- amount fixed at rule-entry time. lib/firms/shared/derive.ts computes the
-- actual effective figure per account from this percentage + the account's
-- own entry history — this column stores only the percentage.
--
-- NULL everywhere except Lucid (and NULL for Lucid Direct's 25K
-- specifically — confirmed "NONE" in the owner-provided screenshot, unlike
-- every other Lucid plan/size which has 60%).
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE firm_rule_sizes
  ADD COLUMN scale_dll_pct NUMERIC(5,2);
