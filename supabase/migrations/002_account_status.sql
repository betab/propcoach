-- supabase/migrations/002_account_status.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds account status tracking (active / breached / passed) — was referenced
-- in the original design but never added to the schema. Also excludes
-- breached/passed accounts from the free-plan 1-account limit, since a
-- closed-out account shouldn't block a trader from starting a new one.
-- Run this in: Supabase Dashboard → SQL Editor, or via CLI: supabase db push
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE accounts
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'breached', 'passed'));

-- Free tier enforcement now only counts accounts still in 'active' status
CREATE OR REPLACE FUNCTION check_account_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_plan TEXT;
  account_count INT;
BEGIN
  SELECT plan INTO user_plan FROM profiles WHERE id = NEW.user_id;
  IF user_plan = 'pro' THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO account_count
  FROM accounts WHERE user_id = NEW.user_id AND is_active = TRUE AND status = 'active';

  IF account_count >= 1 THEN
    RAISE EXCEPTION 'Free plan is limited to 1 active account. Upgrade to Pro for unlimited accounts.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
