-- supabase/migrations/001_initial.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Run this in: Supabase Dashboard → SQL Editor
-- Or via CLI: supabase db push
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Extensions ────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Firms (static reference data, managed by you) ────────────────────────────
CREATE TABLE firms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  logo_url    TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO firms (id, name, logo_url, is_active) VALUES
  ('apex',     'Apex Trader Funding', '/logos/apex.svg',     TRUE),
  ('topstep',  'TopStep',             '/logos/topstep.svg',  FALSE),
  ('tradeday', 'TradeDay',            '/logos/tradeday.svg', FALSE),
  ('mff',      'My Funded Futures',   '/logos/mff.svg',      FALSE);

-- ── User profiles ─────────────────────────────────────────────────────────────
CREATE TABLE profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name           TEXT,
  plan                   TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  stripe_customer_id     TEXT UNIQUE,
  stripe_subscription_id TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Accounts (one row per funded account) ────────────────────────────────────
CREATE TABLE accounts (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  firm_id        TEXT NOT NULL REFERENCES firms(id),
  nickname       TEXT NOT NULL DEFAULT '',
  account_number TEXT DEFAULT '',
  size           INTEGER NOT NULL,
  drawdown_type  TEXT NOT NULL CHECK (drawdown_type IN ('trailing_eod', 'trailing_intraday', 'static')),
  version        TEXT NOT NULL DEFAULT '4.0',
  start_date     DATE,
  is_active      BOOLEAN DEFAULT TRUE,
  payout_count   INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── Session entries ───────────────────────────────────────────────────────────
CREATE TABLE entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date            DATE NOT NULL,
  closing_balance NUMERIC(12,2) NOT NULL,
  pnl             NUMERIC(12,2) NOT NULL,
  contracts       INTEGER DEFAULT 0,
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, date)   -- one entry per account per day
);

-- ── Payouts ───────────────────────────────────────────────────────────────────
CREATE TABLE payouts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID NOT NULL REFERENCES accounts ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  amount      NUMERIC(12,2),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Users can only read/write their own data. This is enforced at the DB level.

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts  ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Accounts
CREATE POLICY "Users can view own accounts"
  ON accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own accounts"
  ON accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own accounts"
  ON accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own accounts"
  ON accounts FOR DELETE USING (auth.uid() = user_id);

-- Entries
CREATE POLICY "Users can view own entries"
  ON entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own entries"
  ON entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own entries"
  ON entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own entries"
  ON entries FOR DELETE USING (auth.uid() = user_id);

-- Payouts
CREATE POLICY "Users can view own payouts"
  ON payouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own payouts"
  ON payouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own payouts"
  ON payouts FOR DELETE USING (auth.uid() = user_id);

-- Firms are public read
CREATE POLICY "Firms are publicly readable"
  ON firms FOR SELECT USING (TRUE);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX idx_accounts_user_id   ON accounts(user_id);
CREATE INDEX idx_entries_account_id ON entries(account_id);
CREATE INDEX idx_entries_user_id    ON entries(user_id);
CREATE INDEX idx_entries_date       ON entries(account_id, date DESC);
CREATE INDEX idx_payouts_account_id ON payouts(account_id);

-- ── Free tier enforcement ─────────────────────────────────────────────────────
-- Prevent free users from creating more than 1 account at the DB level
CREATE OR REPLACE FUNCTION check_account_limit()
RETURNS TRIGGER AS $$
DECLARE
  user_plan TEXT;
  account_count INT;
BEGIN
  SELECT plan INTO user_plan FROM profiles WHERE id = NEW.user_id;
  IF user_plan = 'pro' THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO account_count
  FROM accounts WHERE user_id = NEW.user_id AND is_active = TRUE;

  IF account_count >= 1 THEN
    RAISE EXCEPTION 'Free plan is limited to 1 account. Upgrade to Pro for unlimited accounts.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_account_limit
  BEFORE INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION check_account_limit();
