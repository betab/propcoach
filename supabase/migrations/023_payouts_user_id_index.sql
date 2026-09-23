-- 023_payouts_user_id_index.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Performance Home (app/(app)/home/page.tsx) queries payouts by user_id
-- directly (.eq('user_id', ...)), same as entries already does — but unlike
-- entries (idx_entries_user_id, 001_initial.sql), payouts only has
-- idx_payouts_account_id. Zero-risk, additive index; payouts is empty in
-- production as of this writing so this applies instantly.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX idx_payouts_user_id ON payouts(user_id);
