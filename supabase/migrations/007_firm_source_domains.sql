-- 007_firm_source_domains.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Backs the new fetch-proxy endpoint (app/api/cron/firm-source-fetch) — an
-- admin-managed, per-firm allowlist of hostnames the endpoint is permitted to
-- fetch on behalf of the research Routine (and Claude, manually). Adding a
-- new firm's source is an admin UI action from here on (or a row in this
-- table), never a code change.
--
-- Exact-hostname rows, not suffix matching: 'tradeify.co' does NOT implicitly
-- allow 'help.tradeify.co' — each subdomain actually used is its own row.
-- Simpler to reason about and closes off the obvious bypass class
-- ('evil-tradeify.co.attacker.com' suffix-matching tricks).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE firm_source_domains (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firm_id    TEXT NOT NULL REFERENCES firms(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users,
  UNIQUE (firm_id, domain)
);

ALTER TABLE firm_source_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "firm_source_domains admin read"   ON firm_source_domains FOR SELECT USING (is_admin());
CREATE POLICY "firm_source_domains admin write"  ON firm_source_domains FOR INSERT WITH CHECK (can_edit_rules());
CREATE POLICY "firm_source_domains admin delete" ON firm_source_domains FOR DELETE USING (can_edit_rules());

-- Note: the fetch-proxy route itself uses the service-role client (bearer
-- secret auth, no session — same pattern as the ingest route) and so
-- bypasses these policies entirely; they protect the interactive admin UI,
-- not the fetch path.

-- Seed the domains already known to be needed for the two firms just onboarded.
INSERT INTO firm_source_domains (firm_id, domain) VALUES
  ('apex',     'apextraderfunding.com'),
  ('tradeify', 'tradeify.co'),
  ('tradeify', 'help.tradeify.co'),
  ('lucid',    'lucidtrading.com'),
  ('lucid',    'support.lucidtrading.com');
