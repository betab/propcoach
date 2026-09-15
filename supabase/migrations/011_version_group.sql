-- 011_version_group.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- New-account UX grouping: Tradeify Select's two version_keys (select_daily,
-- select_flex) are the same underlying plan with a payout-cadence choice, not
-- two independent products — but the Add Account picker currently shows all
-- of a firm's versions as one flat, equal-weight list (Growth / Select Daily
-- / Select Flex / Lightning), so Select reads as two separate plans next to
-- Growth and Lightning, which really are separate plans.
--
-- version_group is a plain nullable label: versions sharing the same group
-- value render as one "family" card in the picker (e.g. "Select"), which
-- then reveals a secondary selector for its variants (e.g. "Daily Payouts"
-- vs "Flex Payouts"). NULL (every existing firm/version today) means no
-- grouping — renders exactly as before, one flat entry per version. Nothing
-- here changes what version_key means or how accounts resolve their config;
-- this is a display-only grouping hint for the new-account flow.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE firm_rule_versions
  ADD COLUMN version_group TEXT;
