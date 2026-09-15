-- 013_rules.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- "My Rules" — free-form, self-set trading-discipline reminders. Global list
-- (profiles.trading_rules) shown on the dashboard and every account page;
-- an optional per-account list (accounts.rules) shown only on that account's
-- page, for rules specific to one firm/strategy. Plain newline-separated
-- text, same simplicity as display_name — this is a personal reminder, not
-- structured data anything else needs to query.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN trading_rules TEXT;
GRANT UPDATE (trading_rules) ON profiles TO authenticated;

ALTER TABLE accounts ADD COLUMN rules TEXT;

-- SECURITY FIX, found while making `rules` safely client-writable: unlike
-- profiles (locked down in 004_lock_down_profile_columns.sql), accounts
-- never got the same treatment. "Users can update own accounts" is a
-- row-ownership-only RLS policy with no column restriction, so any
-- authenticated user can currently UPDATE ANY column on their own accounts
-- row directly — including size, firm_id, version, drawdown_type, and
-- start_date, exactly the combination POST /api/accounts carefully
-- validates as resolvable against firm_rule_sizes before ever allowing
-- account creation (see app/api/accounts/route.ts). A direct client UPDATE
-- bypasses that validation entirely and can put an account into the same
-- "no rules found" state the account detail page now merely degrades
-- gracefully for, rather than genuinely preventing. user_id has no WITH
-- CHECK either, so a user could reassign their own account's ownership to
-- a different user's id.
--
-- Fix: same pattern as profiles — revoke blanket UPDATE, grant back only
-- the columns a user should legitimately self-edit directly. status and
-- payout_count are included because the existing status-change and
-- payout-record routes (app/api/accounts/[id]/status,
-- app/api/accounts/[id]/payout) write through the normal per-request
-- client, not a service-role client, and would otherwise break.
REVOKE UPDATE ON accounts FROM authenticated;
GRANT UPDATE (nickname, account_number, rules, status, payout_count) ON accounts TO authenticated;
