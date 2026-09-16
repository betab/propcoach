-- 015_admin_unlimited_accounts.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Exempts admin-tier users (role != 'user' — admin_readonly, admin,
-- super_admin) from the free-plan 1-active-account limit, same as a Pro
-- subscription already does. An admin managing the platform shouldn't need
-- to pay for their own Pro plan just to track more than one funded account.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_account_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_plan TEXT;
  user_role TEXT;
  account_count INT;
BEGIN
  SELECT plan, role INTO user_plan, user_role FROM profiles WHERE id = NEW.user_id;
  IF user_plan = 'pro' OR user_role <> 'user' THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO account_count
  FROM accounts WHERE user_id = NEW.user_id AND is_active = TRUE AND status = 'active';

  IF account_count >= 1 THEN
    RAISE EXCEPTION 'Free plan is limited to 1 active account. Upgrade to Pro for unlimited accounts.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
