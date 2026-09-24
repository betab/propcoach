-- 027_admin_action_log.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- PR A of the Reporting Dashboard milestone (see /root/.claude/plans/ for the
-- full scoping doc). Audit trail for destructive admin actions on a trader's
-- data — the first consumer is the account-reset action (PR C of this same
-- milestone), but the `action` column is deliberately generic so a future
-- audited admin action doesn't need a new table of its own.
--
-- No client INSERT policy at all: every row is written by an admin API route
-- via the service-role client (lib/supabase/admin.ts), same pattern as
-- role changes in app/api/admin/team/[userId]/role — never a direct,
-- RLS-gated client write.
--
-- Run this in: Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE admin_action_log (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id           UUID NOT NULL REFERENCES auth.users,             -- the admin who did it
  target_user_id     UUID NOT NULL REFERENCES auth.users,             -- whose account
  target_account_id  UUID REFERENCES accounts ON DELETE SET NULL,     -- SET NULL, not CASCADE — the audit record should outlive the account it was about (e.g. if that account is later fully deleted via the existing admin delete-user flow)
  action             TEXT NOT NULL,                                   -- 'account_reset' for now
  details            JSONB NOT NULL DEFAULT '{}'::jsonb,               -- e.g. {entries_deleted, payouts_deleted, prior_status, prior_payout_count}
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_action_log_target_user ON admin_action_log(target_user_id);
CREATE INDEX idx_admin_action_log_created_at ON admin_action_log(created_at DESC);

ALTER TABLE admin_action_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_action_log read" ON admin_action_log FOR SELECT USING (is_admin());
