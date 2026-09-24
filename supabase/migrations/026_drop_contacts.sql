-- 026_drop_contacts.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Drops `public.contacts`, an unused table discovered during the 2026-09-23
-- RLS security incident (it had RLS disabled, same as `profiles`, for an
-- unknown reason outside any tracked migration). Investigation found:
-- real-estate-CRM-shaped schema (lead_type defaults to 'Buyer', status to
-- 'New Lead'), 0 rows, not referenced anywhere in the PropCoach codebase.
-- Confirmed with the user (2026-09-24) it's leftover from an unrelated
-- project, not a foundation worth reusing for PropCoach's own future
-- marketing-contacts work (wrong field shape — no plan tier, signup date,
-- opt-in status, etc.) — that gets its own purpose-built schema later,
-- scoped when actually prioritized.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS public.contacts;
