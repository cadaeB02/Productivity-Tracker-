-- V6 Equity Transfers / Audit Log Migration
-- Run this in your Supabase SQL Editor

CREATE TABLE equity_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  from_holder_id UUID REFERENCES equity_holders(id) ON DELETE SET NULL,
  to_holder_id UUID REFERENCES equity_holders(id) ON DELETE SET NULL,
  from_name TEXT NOT NULL,
  to_name TEXT NOT NULL,
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage > 0),
  from_old_pct NUMERIC(5,2) NOT NULL,
  from_new_pct NUMERIC(5,2) NOT NULL,
  to_old_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  to_new_pct NUMERIC(5,2) NOT NULL,
  agreement_doc_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  transferred_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE equity_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transfers" ON equity_transfers FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create transfers" ON equity_transfers FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_transfers_company ON equity_transfers (company_id);
CREATE INDEX idx_transfers_date ON equity_transfers (transferred_at DESC);
