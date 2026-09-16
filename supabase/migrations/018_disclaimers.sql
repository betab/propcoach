-- 018_disclaimers.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- A small, admin-editable disclaimers table. Each row is a footnote: an
-- asterisk goes next to the field it qualifies, and its full text renders in
-- a shared disclaimers box at the bottom of every app page (see
-- components/DisclaimerFooter.tsx and app/(app)/layout.tsx). slug is what
-- links the two — the asterisk links to #disclaimer-<slug>.
--
-- Seeded with the first one: PropCoach's payout-eligibility indicator uses
-- one shared formula (balance above a firm's safety-net threshold, plus
-- consistency and qualifying-day checks) for every firm/plan. Some plans
-- don't actually work that way — e.g. Tradeify Select Flex has no minimum
-- account balance requirement at all, and Select Flex/Daily's real payout
-- caps are a live percentage-of-profit formula, not the flat number
-- PropCoach shows. The eligibility indicator is a best-effort estimate, not
-- a guarantee — surfaced explicitly rather than silently.
--
-- Following 016's lesson: the UPDATE policy is here from the start, not
-- added in a follow-up migration after something breaks silently.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE disclaimers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug       TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  body       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users
);

ALTER TABLE disclaimers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disclaimers public read" ON disclaimers FOR SELECT USING (is_active = TRUE);
CREATE POLICY "disclaimers admin read"  ON disclaimers FOR SELECT USING (is_admin());
CREATE POLICY "disclaimers admin write" ON disclaimers FOR INSERT WITH CHECK (can_edit_rules());
CREATE POLICY "disclaimers admin update" ON disclaimers
  FOR UPDATE USING (can_edit_rules()) WITH CHECK (can_edit_rules());

INSERT INTO disclaimers (slug, label, body, sort_order) VALUES (
  'payout-eligibility',
  'Payout Eligibility',
  'Payout eligibility is estimated using each firm''s standard drawdown, balance, and consistency rules. Some firms/plans use different mechanics PropCoach doesn''t fully model yet — e.g. a plan with no minimum-balance requirement, or a payout cap computed as a percentage of cumulative profit rather than a flat amount. Treat this indicator as a guide, not a guarantee, and confirm against the firm''s own dashboard before requesting a payout.',
  0
);
