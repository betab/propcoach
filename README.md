# PropCoach

Prop trading account manager — track funded accounts across multiple prop firms, stay within rules, and get daily coaching briefs.

---

## Stack

| Layer       | Tool                  |
|-------------|-----------------------|
| Frontend    | Next.js 16 (App Router) |
| Styling     | Tailwind CSS          |
| Auth + DB   | Supabase              |
| Hosting     | Vercel                |
| Payments    | Stripe                |

---

## First-Time Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/propcoach.git
cd propcoach
npm install
```

### 2. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Dashboard → SQL Editor → paste and run `supabase/migrations/001_initial.sql`
3. Settings → API → copy your Project URL and anon key

### 3. Create your Vercel project

1. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo
2. Vercel auto-deploys on every push to `main`

### 4. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in all values. Add the same variables to Vercel → Project Settings → Environment Variables.

### 5. Configure Stripe (for payments)

1. Create account at [stripe.com](https://stripe.com)
2. Dashboard → Products → create "PropCoach Pro Monthly" ($12/mo) and "PropCoach Pro Annual" ($99/yr)
3. Copy the Price IDs into your env vars
4. Set up webhook: Stripe → Developers → Webhooks → Add endpoint
   - URL: `https://your-domain.com/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

### 6. Run locally

```bash
npm run dev
# → http://localhost:3000
```

---

## Adding a New Prop Firm

Firm rules are database-backed, not hardcoded — adding a firm is a data-entry task via the admin dashboard (`/admin`, `admin`/`super_admin` role required), no code deploy needed:

1. Add the firm and its rule versions/sizes via `/admin/firms/new` (or an approved monitoring proposal — see below)
2. Add logo to `public/logos/{firmid}.svg`
3. Toggle `is_active`/`coming_soon` on the firm once its numbers are confirmed

The UI picks it up automatically once the rows exist — no `lib/firms/` code change required. A biweekly automated Routine also researches each active/coming-soon firm's published rules and queues proposed changes in `/admin/proposals` for review; nothing auto-applies.

See `CLAUDE.md` for the full architecture (schema, role model, admin dashboard, monitoring pipeline).

---

## Project Structure

```
propcoach/
├── app/
│   ├── (auth)/login          # Login page
│   ├── (auth)/signup         # Signup page
│   ├── (app)/layout.tsx      # Protected layout with nav
│   ├── (app)/dashboard       # Account list
│   ├── (app)/account/[id]    # Account dashboard
│   ├── (app)/account/[id]/log     # Log a session
│   ├── (app)/account/[id]/history # Session history
│   ├── (app)/settings        # Billing + profile
│   ├── (admin)/admin         # Firm rules, proposals, team, disclaimers (role-gated)
│   └── api/                  # API routes, incl. api/admin/* and api/cron/*
├── lib/
│   ├── firms/                # Prop firm rules engine (DB-backed, not hardcoded)
│   │   ├── types.ts          # Shared interfaces
│   │   ├── index.ts          # Barrel export
│   │   ├── db.ts             # Resolves rules from the DB by effective date
│   │   └── shared/           # derive.ts / coaching.ts — firm-agnostic math
│   ├── supabase/             # DB clients (incl. service-role admin client)
│   ├── admin-auth.ts         # Shared gate for api/admin/* routes
│   └── stripe.ts
├── supabase/
│   └── migrations/           # 001_initial.sql onward — run manually, in order
└── proxy.ts                  # Auth + admin-role redirect (Next.js middleware)
```

See `CLAUDE.md` for full schema, role model, and architecture detail.

---

## Free vs Pro

| Feature              | Free | Pro |
|----------------------|------|-----|
| Accounts             | 1    | Unlimited |
| All prop firms       | ✓    | ✓ |
| Daily coaching       | ✓    | ✓ |
| Session history      | ✓    | ✓ |
| CSV export           | —    | ✓ |
| Priority support     | —    | ✓ |

Limit is enforced at the database level via a Postgres trigger — it cannot be bypassed from the frontend.
