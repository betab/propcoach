-- 014_enable_firms_rls.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- CRITICAL SECURITY FIX. Flagged by Supabase's own security advisor
-- ("Table publicly accessible" / rls_disabled_in_public) and confirmed
-- exploitable locally before writing this migration.
--
-- `firms` was created in 001_initial.sql without ever running ALTER TABLE
-- firms ENABLE ROW LEVEL SECURITY — every other table in this schema has
-- that statement, this one was missed. 003_firm_rules_db.sql later added
-- "firms admin write"/"firms admin update" policies assuming RLS was
-- already on, but Postgres policies are inert until row-level security is
-- actually enabled on the table — so those policies have never been
-- enforced. With no RLS and no REVOKE ever issued, `firms` was governed
-- only by Supabase's default table grants, which give anon/authenticated
-- full SELECT/INSERT/UPDATE/DELETE by default.
--
-- Confirmed locally: an anonymous role (no session, no auth.uid()) could
-- UPDATE any firm's name, INSERT a completely fake firm, and would have
-- been able to DELETE a firm too (blocked only by an unrelated foreign-key
-- constraint from firm_rule_versions in the one case tested, not by any
-- security policy) — all with zero authentication.
--
-- Fix: enable RLS (this alone activates the two write policies that
-- already existed but were never enforced), add the public-read policy
-- every other table in this schema has, and add the one still-missing
-- policy (DELETE) for completeness.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE firms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firms public read" ON firms FOR SELECT USING (true);
CREATE POLICY "firms admin delete" ON firms FOR DELETE USING (can_edit_rules());
