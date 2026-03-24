-- V6 Equity Holders Migration
-- Run this in your Supabase SQL Editor

CREATE TABLE equity_holders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  holder_name TEXT NOT NULL,
  percentage NUMERIC(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  role TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE equity_holders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own equity" ON equity_holders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create equity" ON equity_holders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update equity" ON equity_holders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete equity" ON equity_holders FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_equity_company ON equity_holders (company_id);
