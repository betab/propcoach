-- 024_performance_layout.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Performance Home's "Add Metric" drag-and-drop customization — each user's
-- chosen HUD rail tiles and Signal Detail panels, and their order. Null =
-- not customized yet, page falls back to the default set (every metric,
-- in registry order — see lib/metric-registry.ts).
--
-- Same additive-GRANT pattern as 013_rules.sql/021_daily_target_multiplier.sql/
-- 022_self_service_archive.sql: a live-adjustable UI preference with no
-- effect on firm-rule resolution or account state, safe for the trader to
-- write directly without going through a server route.
--
-- Shape: {"rail": ["mll_locked", "payouts_to_date", ...], "detail": ["pnl_waveform", ...]}
-- — arrays of metric ids from lib/metric-registry.ts's MetricId union, in
-- display order. Validated app-side (the registry is the source of truth
-- for valid ids), not via a CHECK constraint — same trust level as
-- `trading_rules`/`rules` free-text fields already self-writable on this
-- table and `accounts`.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN performance_layout JSONB;

GRANT UPDATE (performance_layout) ON profiles TO authenticated;
