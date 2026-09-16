-- 017_close_orphaned_superseded_sizes.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- One-time data cleanup enabled by 016_firm_rule_sizes_update_policy.sql.
--
-- Because firm_rule_sizes had no UPDATE policy until 016, every supersession
-- approved before this fix landed its new row correctly but silently failed
-- to close the row it was replacing (see 016's comment for the full
-- explanation). This left the table with orphaned "open" rows all over —
-- not just the Tradeify Growth case that surfaced the bug — anywhere a
-- correction was ever approved through the admin UI or the proposal queue.
--
-- This is safe to run repeatedly (a no-op once caught up): for every
-- currently-open row, it looks for a LATER row in the same lineage
-- (same firm_version_id + account_size + drawdown_type) that is ALSO
-- currently open, and closes the earlier one at the later row's
-- effective_from — exactly what the close-out step should have done at
-- approval time. A lineage with only one open row (already correct) is
-- untouched.
--
-- Run this in: Supabase Dashboard → SQL Editor, AFTER running 016.
-- ─────────────────────────────────────────────────────────────────────────────

WITH ranked AS (
  SELECT
    id,
    LEAD(effective_from) OVER (
      PARTITION BY firm_version_id, account_size, drawdown_type
      ORDER BY effective_from
    ) AS next_effective_from
  FROM firm_rule_sizes
  WHERE effective_to IS NULL
)
UPDATE firm_rule_sizes t
SET effective_to = r.next_effective_from
FROM ranked r
WHERE t.id = r.id
  AND r.next_effective_from IS NOT NULL;
