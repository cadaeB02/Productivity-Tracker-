-- V8 Plaid Integration Migration
-- Run this in your Supabase SQL Editor

-- ═══════════════════════════════════════════════
-- Plaid linked bank items (one per bank connection)
-- ═══════════════════════════════════════════════
CREATE TABLE plaid_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  access_token TEXT NOT NULL,
  item_id TEXT NOT NULL,
  institution_name TEXT DEFAULT '',
  institution_id TEXT DEFAULT '',
  cursor TEXT DEFAULT '',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'error', 'disconnected')),
  error_code TEXT,
  consent_expiration TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE plaid_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plaid_items"
  ON plaid_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own plaid_items"
  ON plaid_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plaid_items"
  ON plaid_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plaid_items"
  ON plaid_items FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_plaid_items_user ON plaid_items (user_id);

-- ═══════════════════════════════════════════════
-- Plaid bank accounts (checking, savings, credit, etc.)
-- ═══════════════════════════════════════════════
CREATE TABLE plaid_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plaid_item_id UUID REFERENCES plaid_items(id) ON DELETE CASCADE NOT NULL,
  account_id TEXT NOT NULL,
  name TEXT DEFAULT '',
  official_name TEXT DEFAULT '',
  type TEXT DEFAULT '',
  subtype TEXT DEFAULT '',
  mask TEXT DEFAULT '',
  current_balance DECIMAL(12,2),
  available_balance DECIMAL(12,2),
  iso_currency_code TEXT DEFAULT 'USD',
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE plaid_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plaid_accounts"
  ON plaid_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own plaid_accounts"
  ON plaid_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own plaid_accounts"
  ON plaid_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own plaid_accounts"
  ON plaid_accounts FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_plaid_accounts_user ON plaid_accounts (user_id);
CREATE INDEX idx_plaid_accounts_item ON plaid_accounts (plaid_item_id);

-- ═══════════════════════════════════════════════
-- Extend transactions table for Plaid sync tracking
-- ═══════════════════════════════════════════════
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plaid_transaction_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plaid_account_id UUID REFERENCES plaid_accounts(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Index for fast Plaid transaction lookups (dedup)
CREATE INDEX IF NOT EXISTS idx_transactions_plaid_id ON transactions (plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions (source);
