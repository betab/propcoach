-- supabase/migrations/003_firm_rules_db.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- PR1 of the firm-management milestone: schema only, no app code depends on
-- this yet. Purely additive — safe to run independently of any deploy.
--
-- Adds:
--   1. A 4-tier role column on profiles (user / admin_readonly / admin / super_admin)
--      for the new admin dashboard, plus three SECURITY DEFINER helper functions
--      used in RLS policies below and by future admin routes.
--   2. Effective-dated, append-only firm rule storage (firm_rule_versions /
--      firm_rule_sizes) that replaces the hardcoded TS config in lib/firms/*.
--      Resolution is always "what rules were in effect on this date" via a
--      date-range query — there is no pinned snapshot on accounts, so a
--      later backdated correction can legitimately change an existing
--      account's historical numbers (this was an explicit, deliberate choice).
--   3. The monitoring pipeline's pending-changes queue (firm_rule_check_runs /
--      firm_rule_change_proposals) — nothing ever auto-applies to
--      firm_rule_sizes; only an approved proposal does, via the app's
--      approve route (not written yet — comes in a later PR).
--   4. Seed data: Apex's current hardcoded numbers (from lib/firms/apex/config.ts)
--      and TopStep's existing placeholder numbers (from lib/firms/topstep/rules.ts,
--      already marked TODO/unverified in code — carried over as-is, not new
--      guesses). Apex Legacy is intentionally NOT seeded — those numbers don't
--      exist anywhere (code or docs) yet; entering them is a separate follow-up
--      once the admin dashboard exists.
--
-- Run this in: Supabase Dashboard → SQL Editor, or via CLI: supabase db push
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Roles ────────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin_readonly', 'admin', 'super_admin'));

-- Any admin tier (read-only and up) — can VIEW the admin dashboard/proposals.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin_readonly', 'admin', 'super_admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Full admin and up — can edit firm rules and approve/reject proposals.
CREATE OR REPLACE FUNCTION can_edit_rules()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Super admin only — can grant/revoke/change other users' admin access.
-- (Role changes go through a service-role admin API route, not client-side
-- RLS-gated writes to profiles — see the milestone plan for why.)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Bootstrap yourself as super_admin — run this ONE LINE MANUALLY after
-- confirming the rest of this migration applied cleanly. Left commented out
-- on purpose: nothing should auto-grant admin access to anyone on signup.
-- UPDATE profiles SET role = 'super_admin'
--   WHERE id = (SELECT id FROM auth.users WHERE email = 'brandon@brandonroad.com');

-- ── 2. Firm metadata additions (for the monitoring workflow) ─────────────────

ALTER TABLE firms
  ADD COLUMN coming_soon BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN rules_last_verified_at TIMESTAMPTZ,
  ADD COLUMN rules_last_verified_by UUID REFERENCES auth.users;

-- Apex and TopStep already reflect their real current state via is_active in
-- 001_initial.sql (apex TRUE, topstep/tradeday/mff FALSE) — align coming_soon
-- to match what lib/firms/index.ts's FIRM_REGISTRY says today.
UPDATE firms SET coming_soon = FALSE WHERE id = 'apex';
UPDATE firms SET coming_soon = TRUE  WHERE id IN ('topstep', 'tradeday', 'mff');

-- ── 3. Firm rules — effective-dated, append-only ──────────────────────────────

CREATE TABLE firm_rule_versions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id        TEXT NOT NULL REFERENCES firms(id),
  version_key    TEXT NOT NULL,              -- '4.0', 'legacy', 'standard'
  version_label  TEXT NOT NULL,              -- '4.0 (March 2026+)'
  is_current     BOOLEAN NOT NULL DEFAULT TRUE,   -- offered to NEW accounts?
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  created_by     UUID REFERENCES auth.users,
  UNIQUE (firm_id, version_key)
);

CREATE TABLE firm_rule_sizes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_version_id       UUID NOT NULL REFERENCES firm_rule_versions(id) ON DELETE CASCADE,
  account_size          INTEGER NOT NULL,
  drawdown_type         TEXT NOT NULL CHECK (drawdown_type IN ('trailing_eod', 'trailing_intraday', 'static')),
  drawdown_amount       NUMERIC(12,2) NOT NULL,
  daily_loss_limit      NUMERIC(12,2),                       -- null = no DLL
  safety_net_buffer     NUMERIC(12,2) NOT NULL DEFAULT 100,  -- safetyNet = size + drawdown + buffer
  mll_lock_buffer       NUMERIC(12,2) NOT NULL DEFAULT 100,  -- mllLockAt  = size + buffer
  qualifying_day_min    NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_qualifying_days   INTEGER NOT NULL DEFAULT 0,          -- see seed-data note below
  max_contracts         INTEGER NOT NULL,
  consistency_rule_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  payout_ladder         NUMERIC(12,2)[] NOT NULL DEFAULT '{}',
  min_payout            NUMERIC(12,2) NOT NULL DEFAULT 0,
  extra                 JSONB NOT NULL DEFAULT '{}'::jsonb,  -- escape hatch (e.g. TopStep profit target)
  effective_from        DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to          DATE,                                -- null = still open-ended
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  created_by            UUID REFERENCES auth.users
);

CREATE INDEX idx_firm_rule_sizes_lookup
  ON firm_rule_sizes(firm_version_id, account_size, drawdown_type, effective_from);

-- ── 4. Monitoring pipeline — pending-changes queue ────────────────────────────

CREATE TABLE firm_rule_check_runs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_type          TEXT NOT NULL CHECK (run_type IN ('biweekly_auto', 'manual')),
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  firms_checked     TEXT[],
  proposals_created INTEGER DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error_message     TEXT,
  summary           TEXT
);

CREATE TABLE firm_rule_change_proposals (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id                   UUID REFERENCES firm_rule_check_runs(id),
  firm_id                  TEXT NOT NULL REFERENCES firms(id),
  firm_rule_size_id        UUID REFERENCES firm_rule_sizes(id),  -- null for a brand-new size/version/firm
  proposal_type            TEXT NOT NULL CHECK (proposal_type IN ('update_existing', 'new_size', 'new_version', 'new_firm')),
  field_diffs              JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {field: {old, new}}
  proposed_data            JSONB,                                -- full row payload for new_*
  source_url               TEXT,
  source_excerpt            TEXT,
  confidence                TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  proposed_effective_from   DATE,                                 -- admin can adjust on approve
  detected_at               TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at               TIMESTAMPTZ,
  reviewed_by               UUID REFERENCES auth.users,
  review_note                TEXT
);

-- ── 5. Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE firm_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_rule_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_rule_check_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE firm_rule_change_proposals ENABLE ROW LEVEL SECURITY;

-- Public read — every account page needs these to compute a trader's stats.
CREATE POLICY "firm_rule_versions public read" ON firm_rule_versions FOR SELECT USING (TRUE);
CREATE POLICY "firm_rule_sizes public read"    ON firm_rule_sizes    FOR SELECT USING (TRUE);

-- Rule edits require full admin (or super_admin).
CREATE POLICY "firm_rule_versions admin write"  ON firm_rule_versions FOR INSERT WITH CHECK (can_edit_rules());
CREATE POLICY "firm_rule_versions admin update" ON firm_rule_versions FOR UPDATE USING (can_edit_rules());
CREATE POLICY "firm_rule_sizes admin write"     ON firm_rule_sizes    FOR INSERT WITH CHECK (can_edit_rules());

-- firms table currently has no write policy at all for anyone — add one.
CREATE POLICY "firms admin write"  ON firms FOR INSERT WITH CHECK (can_edit_rules());
CREATE POLICY "firms admin update" ON firms FOR UPDATE USING (can_edit_rules());

-- Proposals/runs — read-only admins can VIEW the queue, only full admins can act on it.
CREATE POLICY "proposals admin read"  ON firm_rule_change_proposals FOR SELECT USING (is_admin());
CREATE POLICY "proposals admin write" ON firm_rule_change_proposals FOR UPDATE USING (can_edit_rules());
CREATE POLICY "runs admin read"       ON firm_rule_check_runs       FOR SELECT USING (is_admin());

-- Note: the monitoring ingest route (a later PR) uses a service-role client
-- that bypasses RLS entirely to insert proposals — these policies protect the
-- interactive dashboard, not that ingest path.

-- ── 6. Seed data ───────────────────────────────────────────────────────────────
-- Migrates the numbers already hardcoded in lib/firms/apex/config.ts and
-- lib/firms/topstep/rules.ts verbatim — not new numbers, just relocated.
-- min_qualifying_days is seeded as 0 for every row: this preserves today's
-- live (known-buggy, see Milestone 4 audit) behavior exactly rather than
-- guessing a real minimum — correct this via the admin dashboard once you
-- have the real figure from each firm's docs.
--
-- IMPORTANT: effective_from is set to an early sentinel date (2020-01-01),
-- NOT left at its CURRENT_DATE default. These rows must cover every account
-- that already exists in production (all of which have a start_date long
-- before today) — if this were seeded at "today," the effective-dated
-- resolution query in getFirmConfigForAccount() would find zero rows for
-- any existing account's start_date and break every one of them the moment
-- PR2 ships. Caught by testing the resolution query against this exact
-- migration locally before proposing it — see PR description.

WITH apex_version AS (
  INSERT INTO firm_rule_versions (firm_id, version_key, version_label, is_current)
  VALUES ('apex', '4.0', '4.0 (March 2026+)', TRUE)
  RETURNING id
)
INSERT INTO firm_rule_sizes (
  firm_version_id, account_size, drawdown_type, drawdown_amount, daily_loss_limit,
  safety_net_buffer, mll_lock_buffer, qualifying_day_min, min_qualifying_days,
  max_contracts, consistency_rule_pct, payout_ladder, min_payout, effective_from
)
SELECT apex_version.id, size, drawdown_type, drawdown_amount, daily_loss_limit,
       100, 100, 250, 0, max_contracts, 50, ladder, 500, DATE '2020-01-01'
FROM apex_version, (VALUES
  -- size,   drawdown_type,          drawdown, dll,   max_contracts, ladder
  (25000,  'trailing_eod',        1500::numeric,  500::numeric,  2, ARRAY[500,750,1000,1000,1250,1500]::numeric(12,2)[]),
  (25000,  'trailing_intraday',   1500::numeric,  NULL::numeric, 2, ARRAY[500,750,1000,1000,1250,1500]::numeric(12,2)[]),
  (50000,  'trailing_eod',        2500::numeric, 1000::numeric,  4, ARRAY[1000,1250,1500,1500,1750,2000]::numeric(12,2)[]),
  (50000,  'trailing_intraday',   2500::numeric,  NULL::numeric, 4, ARRAY[1000,1250,1500,1500,1750,2000]::numeric(12,2)[]),
  (100000, 'trailing_eod',        3000::numeric, 1500::numeric,  6, ARRAY[2000,2500,3000,3000,3500,4000]::numeric(12,2)[]),
  (100000, 'trailing_intraday',   3000::numeric,  NULL::numeric, 6, ARRAY[2000,2500,3000,3000,3500,4000]::numeric(12,2)[]),
  (150000, 'trailing_eod',        5000::numeric, 2000::numeric,  9, ARRAY[2500,3000,3500,3500,4000,4500]::numeric(12,2)[]),
  (150000, 'trailing_intraday',   5000::numeric,  NULL::numeric, 9, ARRAY[2500,3000,3500,3500,4000,4500]::numeric(12,2)[])
) AS s(size, drawdown_type, drawdown_amount, daily_loss_limit, max_contracts, ladder);

-- TopStep — kept as coming_soon/inactive; numbers below are the same
-- TODO-marked placeholders already in lib/firms/topstep/rules.ts (dailyLossLimit
-- null, qualifyingDayMin 200, consistencyRule 0, payoutLadder [5000,5000,5000],
-- minPayout 100 — all flagged "TODO: verify" in the original code). TopStep's
-- code also hardcodes drawdown_type to 'trailing_eod' regardless of what's
-- passed in — carried over here as the only row seeded per size.
WITH topstep_version AS (
  INSERT INTO firm_rule_versions (firm_id, version_key, version_label, is_current)
  VALUES ('topstep', 'standard', 'Standard', TRUE)
  RETURNING id
)
INSERT INTO firm_rule_sizes (
  firm_version_id, account_size, drawdown_type, drawdown_amount, daily_loss_limit,
  safety_net_buffer, mll_lock_buffer, qualifying_day_min, min_qualifying_days,
  max_contracts, consistency_rule_pct, payout_ladder, min_payout, extra, effective_from
)
SELECT topstep_version.id, size, 'trailing_eod', drawdown_amount, NULL,
       100, 100, 200, 0, max_contracts, 0,
       ARRAY[5000,5000,5000]::numeric(12,2)[], 100,
       jsonb_build_object('profitTarget', profit_target), DATE '2020-01-01'
FROM topstep_version, (VALUES
  -- size,   drawdown_amount, profit_target, max_contracts
  (50000,  2000::numeric, 3000::numeric, 5),
  (100000, 3000::numeric, 6000::numeric, 10),
  (150000, 4500::numeric, 9000::numeric, 15)
) AS s(size, drawdown_amount, profit_target, max_contracts);
