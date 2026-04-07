-- V9 Vendor Intelligence Migration
-- Run this in your Supabase SQL Editor

-- ═══════════════════════════════════════════════
-- Vendors table (per-company tech stack tracking)
-- ═══════════════════════════════════════════════
CREATE TABLE vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  display_name TEXT,
  logo_url TEXT DEFAULT '',
  color TEXT DEFAULT '#6366f1',
  category TEXT DEFAULT 'software'
    CHECK (category IN ('ai', 'hosting', 'communication', 'marketing', 'automation', 'software', 'analytics', 'payments', 'legal', 'other')),
  website TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vendors"
  ON vendors FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own vendors"
  ON vendors FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vendors"
  ON vendors FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own vendors"
  ON vendors FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_vendors_user ON vendors (user_id);
CREATE INDEX idx_vendors_company ON vendors (company_id);
CREATE INDEX idx_vendors_category ON vendors (category);

-- ═══════════════════════════════════════════════
-- Extend transactions with vendor tracking
-- ═══════════════════════════════════════════════
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_vendor ON transactions (vendor_id) WHERE vendor_id IS NOT NULL;

-- ═══════════════════════════════════════════════
-- Extend documents with vendor tracking
-- ═══════════════════════════════════════════════
ALTER TABLE documents ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_vendor ON documents (vendor_id) WHERE vendor_id IS NOT NULL;

-- ═══════════════════════════════════════════════
-- Vendor name matching aliases (for AI auto-detection)
-- Maps common merchant names from Plaid/receipts to vendor names
-- ═══════════════════════════════════════════════
CREATE TABLE vendor_aliases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE NOT NULL,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE vendor_aliases ENABLE ROW LEVEL SECURITY;

-- Aliases inherit access from parent vendor (join-based)
CREATE POLICY "Users can view own vendor_aliases"
  ON vendor_aliases FOR SELECT USING (
    EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_aliases.vendor_id AND vendors.user_id = auth.uid())
  );
CREATE POLICY "Users can create vendor_aliases"
  ON vendor_aliases FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_aliases.vendor_id AND vendors.user_id = auth.uid())
  );
CREATE POLICY "Users can delete vendor_aliases"
  ON vendor_aliases FOR DELETE USING (
    EXISTS (SELECT 1 FROM vendors WHERE vendors.id = vendor_aliases.vendor_id AND vendors.user_id = auth.uid())
  );

CREATE INDEX idx_vendor_aliases_vendor ON vendor_aliases (vendor_id);
CREATE INDEX idx_vendor_aliases_alias ON vendor_aliases (alias);
