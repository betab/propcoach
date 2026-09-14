-- 006_optional_daily_loss_limit.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds support for firms (Lucid Trading, confirmed directly from their own
-- site) that let a trader opt into a Daily Loss Limit at a fixed $ amount
-- per size, rather than baking DLL into the plan itself the way Apex does.
--
-- optional_daily_loss_limit on firm_rule_sizes: the $ amount IF a trader
-- opts in for this size (NULL = this firm/size doesn't offer the option at
-- all — most rows, including every existing Apex/TopStep row). The existing
-- daily_loss_limit column keeps meaning what it always has: the DEFAULT/base
-- DLL applied when the trader does NOT opt in (NULL for Lucid, since DLL is
-- off unless chosen).
--
-- daily_loss_limit_enabled on accounts: the trader's one-time choice, made
-- when the account is created (mirrors how the option works on Lucid's own
-- site — chosen at purchase, not changeable after). Defaults to false so
-- every existing account is unaffected.
--
-- lib/firms/db.ts resolves the two into a single effective dailyLossLimit
-- before anything downstream (derive.ts, coaching.ts, account pages) ever
-- sees it — none of that code needs to know this toggle exists.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE firm_rule_sizes
  ADD COLUMN optional_daily_loss_limit NUMERIC(12,2);

ALTER TABLE accounts
  ADD COLUMN daily_loss_limit_enabled BOOLEAN NOT NULL DEFAULT false;
