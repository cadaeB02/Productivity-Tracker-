-- FocusArch v3.0 Migration: Physical Hours, Pay Tracking, User Settings
-- Run this in your Supabase SQL Editor

-- ==================== COMPANIES: Pay & Tax Fields ====================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_type TEXT DEFAULT 'digital';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pay_rate DECIMAL(10,2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pay_type TEXT DEFAULT 'hourly';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pay_period TEXT DEFAULT 'biweekly';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pay_period_start DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_federal_rate DECIMAL(5,2) DEFAULT 12.00;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_state_rate DECIMAL(5,2) DEFAULT 4.40;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_fica_rate DECIMAL(5,2) DEFAULT 7.65;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_deductions_pretax DECIMAL(10,2) DEFAULT 0.00;

-- ==================== USER SETTINGS: Persistent API Keys ====================

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  gemini_api_key TEXT DEFAULT '',
  wiw_api_key TEXT DEFAULT '',
  wiw_email TEXT DEFAULT '',
  wiw_password TEXT DEFAULT '',
  wiw_token TEXT DEFAULT '',
  wiw_token_expires TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== TASKS: Completion & Notes ====================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- RLS for user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings" ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own settings" ON user_settings FOR DELETE USING (auth.uid() = user_id);
