# PropCoach — project reference

Prop-trading account tracker: traders log daily entries against a funded account, PropCoach computes drawdown/payout math per that firm's rules and gives coaching feedback. Multi-firm (Apex live; Tradeify, Lucid, TopStep onboarded/partial; more via the admin dashboard, no code deploy needed).

This file is the living cross-session reference — architecture, schema, conventions. Update it (see "Keeping this file current" at the bottom) instead of letting it drift; a stale plan file caused real confusion once already (Sept 2026 — a fully-shipped milestone got mistaken for unstarted work). `README.md` stays the short human-facing setup doc; this file is the deeper one.

---

## Stack

Next.js 16 (App Router) · React 18 · TypeScript · Tailwind CSS · Supabase (Postgres + Auth + Storage) · Stripe · Recharts · Vercel.

---

## Route map

```
app/
  (auth)/login, (auth)/signup            — public
  (app)/…                                 — regular signed-in users; guard in app/(app)/layout.tsx
    dashboard, dashboard/new-account
    account/[id], account/[id]/log, account/[id]/history
    settings, settings/billing
  (admin)/admin/…                         — role != 'user' only; guard in app/(admin)/layout.tsx
    page.tsx                              — firm overview
    firms/…, firms/[firmId]/versions/[versionId]/sizes/[sizeId]  — firm rule CRUD
    proposals                             — monitoring queue, approve/reject
    team                                  — super_admin only: grant/revoke roles
    disclaimers
  api/
    accounts, accounts/[id]/{status,payout}
    entries/[id]/delete
    admin/…                               — mirrors the (admin) pages, all mutation routes
    cron/firm-rules-ingest                — monitoring Routine POSTs findings here
    cron/firm-source-fetch                — allowlisted fetch-proxy for firm research
    stripe/{checkout,portal,webhook}
proxy.ts                                  — Next.js middleware (best-effort redirect only, see guard pattern below)
```

**Not yet built:** `app/(admin)/admin/users/…` + `app/api/admin/users/…` — Super Admin direct editing of another user's profile/accounts/entries. Planned, scoped, not started (see `/root/.claude/plans/velvety-jumping-waterfall.md`).

---

## The 3-layer guard pattern

Every protected surface in this app is checked three times, each layer trusting the next as backstop rather than replacing it:

1. **`proxy.ts`** (Next.js middleware) — best-effort UX redirect only. Unauthenticated → `/login`; authenticated non-admin hitting `/admin/*` → `/dashboard`.
2. **Route-group `layout.tsx`** (`app/(app)/layout.tsx`, `app/(admin)/layout.tsx`) — the real gate. Server component, re-checks `getUser()` + role, `redirect()`s if it fails.
3. **RLS policies** — final backstop, enforced even if 1 and 2 both had bugs.

Mutation API routes add a fourth check inline: `lib/admin-auth.ts`'s `requireCanEditRules(supabase)` gives a clean 401/403 instead of relying on a silent RLS rejection. Every route under `app/api/admin/*` calls it.

---

## Role model

`profiles.role`: `user → admin_readonly → admin → super_admin` (default `'user'`). Three SECURITY DEFINER SQL helpers, used in RLS policies and app code alike:

- `is_admin()` — any admin tier; can view the admin dashboard/proposal queue.
- `can_edit_rules()` — `admin` and up; can edit firm rules, approve/reject proposals.
- `is_super_admin()` — `super_admin` only; can grant/revoke/change other users' roles (via `/api/admin/team/[userId]/role`, service-role client — role changes never go through a client-side RLS-gated write).

Admin-tier users are also exempt from the free-plan 1-account limit (migration 015).

---

## Database schema (current state, generated from migrations 001–019)

Postgres via Supabase. **No migration runner exists** — every migration is run manually in the Supabase SQL Editor, in order, by the user. `supabase/migrations/*.sql` is the real source of truth; this section is a snapshot for fast reference (see "Keeping this file current").

### `firms`
Static reference data. `id` (text PK, e.g. `'apex'`), `name`, `logo_url`, `is_active`, `coming_soon`, `rules_last_verified_at`, `rules_last_verified_by`.
RLS: public read; admin-only insert/update/delete.

### `profiles`
One row per `auth.users`, auto-created on signup (trigger). `id` (PK = auth uid), `display_name`, `plan` (`free`/`pro`), `stripe_customer_id`, `stripe_subscription_id`, `role`, `avatar_url`, `trading_rules`, timestamps.
RLS: users can only see/touch their own row. **Column-level lockdown** (migration 004, closing a real self-promotion exploit): blanket `UPDATE` is revoked from `authenticated`; only `display_name`, `stripe_customer_id`, `avatar_url`, `trading_rules` are directly self-writable. `role`, `plan`, `stripe_subscription_id` require the service-role client (role: admin team route; plan/subscription: Stripe webhook).

### `accounts`
One funded account per trader. `id`, `user_id`, `firm_id`, `nickname`, `account_number`, `size`, `drawdown_type` (`trailing_eod`/`trailing_intraday`/`static`), `version`, `start_date`, `is_active`, `status` (`active`/`breached`/`passed`), `payout_count`, `daily_loss_limit_enabled`, `rules`, timestamps.
RLS: own rows only. **Column-level lockdown** (migration 013, same exploit class as profiles): only `nickname`, `account_number`, `rules`, `status`, `payout_count` are directly self-writable. `size`/`firm_id`/`version`/`drawdown_type`/`start_date`/`user_id` are locked — must go through the validated `POST /api/accounts` create flow, never a direct client update.

### `entries`
Daily log rows. `id`, `account_id`, `user_id`, `date`, `closing_balance`, `pnl`, `contracts`, `notes`, `created_at`. `UNIQUE(account_id, date)` — one entry per account per day.
RLS: own rows only, full CRUD.

### `payouts`
`id`, `account_id`, `user_id`, `amount`, `recorded_at`. RLS: own rows, insert/select/delete (no update policy).

### `firm_rule_versions`
A firm's named ruleset (e.g. Apex "4.0"). `id`, `firm_id`, `version_key`, `version_label`, `is_current`, `version_group` (nullable UX grouping hint, e.g. Tradeify Select's Daily/Flex variants share one group), timestamps/`created_by`. `UNIQUE(firm_id, version_key)`.
RLS: public read; admin insert/update.

### `firm_rule_sizes`
The actual rule numbers, **effective-dated and append-only** — never mutated in place except to close out `effective_to` when superseded. `id`, `firm_version_id`, `account_size`, `drawdown_type`, `drawdown_amount`, `daily_loss_limit` (nullable), `safety_net_buffer`, `mll_lock_buffer`, `qualifying_day_min`, `min_qualifying_days`, `max_contracts`, `consistency_rule_pct`, `payout_ladder[]`, `min_payout`, `extra` (jsonb escape hatch, e.g. TopStep's profit target), `effective_from`, `effective_to` (null = open-ended), timestamps/`created_by`, plus later additions: `optional_daily_loss_limit` (opt-in DLL, Lucid), `scale_dll_pct` (Lucid's DLL-as-%-of-peak once MLL locks), `consistency_schedule[]` (escalating consistency by payout count, Tradeify Lightning), `min_days_between_payouts` (Tradeify Select Flex payout cadence gate), `requires_minimum_balance` (opt-out of the standard balance-above-safety-net payout gate, Tradeify Select Flex).

**Resolution is always a date-range query** against an account's `start_date` — there is no pinned snapshot on `accounts`, so a later backdated correction can legitimately change an existing account's historical numbers (deliberate design choice):
```sql
SELECT * FROM firm_rule_sizes
WHERE firm_version_id = $1 AND account_size = $2 AND drawdown_type = $3
  AND effective_from <= $4  -- account.start_date
  AND (effective_to IS NULL OR effective_to > $4)
ORDER BY effective_from DESC LIMIT 1;
```
Superseding inserts a new row and sets the *previous* row's `effective_to` — never an in-place numeric edit.

RLS: public read; admin insert; admin update (added in migration 016 — **it was missing from launch through migration 015**, which silently no-op'ed every "close out the old row" step of a supersession rather than erroring; migration 017 was the one-time data cleanup this enabled, closing orphaned still-open superseded rows across the whole table).

### `firm_rule_check_runs` / `firm_rule_change_proposals`
The monitoring pipeline's pending-changes queue — **nothing auto-applies**; only an approved proposal writes to `firm_rule_sizes`, via the app's approve route. `firm_rule_check_runs`: `run_type` (`biweekly_auto`/`manual`), timestamps, `firms_checked[]`, `proposals_created`, `status`, `error_message`, `summary`. `firm_rule_change_proposals`: `run_id`, `firm_id` (**not** a hard FK — see migration 005, needed so `proposal_type = 'new_firm'` can exist before the firm row does; app-level validation covers the other three types instead), `firm_rule_size_id`, `proposal_type` (`update_existing`/`new_size`/`new_version`/`new_firm`), `field_diffs` (jsonb), `proposed_data` (jsonb, full row for `new_*`), `source_url`, `source_excerpt`, `confidence`, `status` (`pending`/`approved`/`rejected`), `proposed_effective_from`, review metadata.
RLS: admin read; full-admin update. The ingest route (§ below) uses the service-role client and bypasses RLS entirely — these policies protect the interactive dashboard only.

### `firm_source_domains`
Admin-managed allowlist of hostnames the fetch-proxy (`/api/cron/firm-source-fetch`) may fetch on a firm's behalf — exact-hostname rows, no suffix matching (closes the `evil-tradeify.co.attacker.com` bypass class). `id`, `firm_id`, `domain`, `created_at`/`created_by`. `UNIQUE(firm_id, domain)`.
RLS: admin read; admin write/delete. The fetch-proxy route itself uses the service-role client (bearer-secret auth), bypassing these too.

### `disclaimers`
Admin-editable footnotes — an asterisk next to a field links (`#disclaimer-<slug>`) to full text in a shared footer on every app page. `id`, `slug` (unique), `label`, `body`, `is_active`, `sort_order`, timestamps/`updated_by`.
RLS: public read (active only); admin read/write/update.

### Storage
`avatars` bucket (public read). Write policies restrict to a user's own folder (`{user_id}/avatar.{ext}`, first path segment = own `auth.uid()`).

---

## `lib/firms/` — the rules engine

- **`types.ts`** — the shared contract. `AccountConfig` (everything a firm/size/date resolves to), `DerivedMetrics` (everything `derive()` computes for one account), `Entry`/`Account`/`Payout` (raw DB rows), `FirmVersion`/`FirmMeta`.
- **`db.ts`** — DB-backed config resolution: `getFirmConfigForAccount`, `getCurrentFirmConfig`, `getAllFirms`, `getActiveFirms`, `getFirmVersions`, `getAvailableSizes`. This is what replaced the old hardcoded `apex/`/`topstep/` TypeScript modules (deleted) — adding a firm is now pure data entry via the admin dashboard.
- **`shared/derive.ts`** — firm-agnostic drawdown/payout math, one implementation every firm shares. Computes trailing MLL (locks/stops rising past `mllLockAt` — `Math.min`, not `Math.max`, a bug fixed once already, see the comment in the file), effective daily loss limit (static, or Lucid's dynamic `peak × scaleDllPct%` once locked), payout eligibility (balance-above-safety-net gate unless `requiresMinimumBalance` is false, consistency check against the flat or escalating-schedule rule, qualifying-days gate, payout-frequency gate), and `deriveBalanceHistory()` (per-entry balance/MLL/DLL-floor points powering the account page's chart).
- **`shared/coaching.ts`** — `buildCoaching()`, turns `DerivedMetrics` into the coaching cards shown on the account page.
- **`index.ts`** — barrel export.

**Known open gap, deliberately not fixed:** EOD vs. intraday trailing drawdown produce identical MLL math today — true intraday trailing needs a data-model change to `entries` (capturing an intraday low, not just closing balance), out of scope until specifically prioritized.

---

## Admin/service-role infrastructure

- **`lib/admin-auth.ts`** — `requireCanEditRules(supabase)`, the shared gate for `app/api/admin/*` mutation routes.
- **`lib/supabase/admin.ts`** — `createAdminClient()`, the service-role client. Server-only, never imported into a client component. Bypasses RLS *and* the column-GRANT lockdowns entirely — used only where that's specifically required (role management, the monitoring ingest/fetch-proxy routes, the Stripe webhook).
- **`lib/admin-proposals.ts`**, **`lib/admin-firm-rule-form.ts`** — proposal-approval and rule-form logic for the admin dashboard.
- **`lib/disclaimers.ts`** — disclaimer fetch/lookup helpers.

---

## Theme (`tailwind.config.js`, `app/globals.css`)

Dark trading-terminal aesthetic.

| Token | Value | Use |
|---|---|---|
| `bg` / `bg2` / `bg3` | `#080c11` / `#0a0e14` / `#0d1420` | background layers, darkest to card-level |
| `border` | `#1a2a40` | hairlines |
| `muted` / `dim` | `#5a7a90` / `#3a6a90` | secondary/tertiary text |
| `green` | `#00ff88` | balance, positive, primary accent |
| `amber` | `#ffaa00` | admin-mode chrome, warnings |
| `danger` | `#ff4444` | breach, negative, minimum-balance line |
| `blue` | `#7aa3d4` | informational (loss-limit line, etc.) |

Fonts: `IBM Plex Mono` (body/mono), `Bebas Neue` (display/headers).

The admin route group (`(admin)`) uses this same palette but with amber-forward chrome specifically so editing live financial rule numbers is visually unmistakable from normal app use.

---

## Dev workflow conventions (established across many PRs this project)

- **No live Supabase credentials in the sandbox.** `next build`/`next dev` need at least syntactically-valid env vars (`proxy.ts` calls `createServerClient()` on every request) — use placeholder values for local verification, never assume a real backend is reachable.
- **UI verification pattern**: create a temporary route under `app/` (never prefixed with `_` — Next.js App Router excludes those from routing), start `next dev` in the background with placeholder Supabase env vars, screenshot via Playwright (`executablePath: '/opt/pw-browsers/chromium'`), then delete the temp route and stop the dev server before committing. Verify the server actually stopped via a connection check, not the process's exit code (background `pkill` reliably returns a nonstandard exit code in this sandbox — harmless).
- **Every PR is squash-merged.** After a merge, the local branch has stale "already merged" commits mixed with new work — the pattern is: commit locally → `git fetch origin main` → `git checkout -B <branch> origin/main` → `git cherry-pick <new-commit-sha>` → `npx tsc --noEmit` → push.
- **Force-push is always blocked** by the permission classifier as destructive — expect to explicitly confirm with the user before every one via `AskUserQuestion`, even though the branch is solely this work.
- **Migrations run manually** by the user in the Supabase SQL Editor — no automated runner. A PR that needs a schema change ships the `.sql` file; the user runs it and confirms before/alongside merge.
- **`tsc --noEmit` clean before every push** — the consistent correctness gate in the absence of a live backend to test against.
- Small, single-purpose PRs, reviewed and merged one at a time.

---

## Where the plan lives

`/root/.claude/plans/velvety-jumping-waterfall.md` — architecture reference for the DB-backed firm rules system (now shipped) plus the one remaining piece (Super Admin user-record editing, not yet built) and the separate not-yet-scoped reporting-dashboard milestone (user stats, bulk account actions).

---

## Keeping this file current

- **Schema section**: after any new migration lands, regenerate the affected table's entry by reading the new migration file directly — don't hand-patch from memory. For a full re-sync, read `supabase/migrations/*.sql` in order (small: ~950 lines across 19 files as of this writing) rather than trusting an incremental diff. Update the "generated from migrations 001–NNN" marker in this section's heading.
- **Route map / lib overview**: re-derive from `find app lib components -type f` rather than assuming a comment here is still accurate — file layout is easy to grep, cheap to re-verify, and this doc should never be treated as more authoritative than the code it describes.
- **Plan file pointer**: if `/root/.claude/plans/velvety-jumping-waterfall.md` is superseded, deleted, or a new plan replaces it, update this section — this file's "shipped vs. pending" claims should never silently drift from that plan's actual status.
