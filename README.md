# PropCoach

Prop trading account manager — track funded accounts across multiple prop firms, stay within rules, and get daily coaching briefs.

---

## Stack

| Layer       | Tool                  |
|-------------|-----------------------|
| Frontend    | Next.js 14 (App Router) |
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

1. Create `lib/firms/{firmid}/config.ts` — account sizes and parameters
2. Create `lib/firms/{firmid}/rules.ts` — implement the `FirmRules` interface
3. Add the firm to `lib/firms/index.ts` with `isActive: true`
4. Add logo to `public/logos/{firmid}.svg`
5. Run migration if any schema changes needed

That's it — the UI picks it up automatically.

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
│   └── api/                  # API routes
├── lib/
│   ├── firms/                # Prop firm rules engine
│   │   ├── types.ts          # Shared interfaces
│   │   ├── index.ts          # Firm registry
│   │   ├── apex/             # Apex Trader Funding
│   │   └── topstep/          # TopStep (coming soon)
│   ├── supabase/             # DB clients
│   └── stripe.ts
├── supabase/
│   └── migrations/001_initial.sql
└── middleware.ts             # Auth protection
```

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
