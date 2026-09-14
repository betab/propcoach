-- 005_proposals_firm_id_not_fk.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug found live while actually submitting a new_firm proposal (Tradeify/Lucid
-- research, first real use of that proposal_type): firm_rule_change_proposals
-- .firm_id had a hard FK to firms(id) from the original 003 migration. That
-- makes proposal_type = 'new_firm' structurally impossible to ever insert —
-- by definition, a new firm's id doesn't exist in firms yet. The insert
-- failed with "violates foreign key constraint
-- firm_rule_change_proposals_firm_id_fkey" every time.
--
-- update_existing/new_size/new_version proposals SHOULD reference a real,
-- already-existing firm — but that's an application-level invariant, not a
-- DB one: app/api/cron/firm-rules-ingest/route.ts already resolves firm_id
-- against firms/firm_rule_versions before inserting for those three types
-- (see its update_existing/new_size/new_version branches), so dropping the
-- DB-level FK loses no real protection for them, and is what makes new_firm
-- possible at all.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE firm_rule_change_proposals
  DROP CONSTRAINT firm_rule_change_proposals_firm_id_fkey;
