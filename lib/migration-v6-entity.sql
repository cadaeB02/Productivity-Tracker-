-- ============================================================
-- HoldCo OS V6.0 Migration: Entity Foundation
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ==================== COMPANIES: Entity Fields ====================
-- Adds LLC-specific fields so a company can also represent a real business entity.
-- All columns are optional with safe defaults. Nothing breaks if left empty.

-- Is this company a formal LLC/entity?
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_entity BOOLEAN DEFAULT false;

-- Legal details
ALTER TABLE companies ADD COLUMN IF NOT EXISTS legal_name TEXT DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ein TEXT DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS state_of_formation TEXT DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS formation_date DATE;

-- Compliance
ALTER TABLE companies ADD COLUMN IF NOT EXISTS state_renewal_date DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS registered_agent TEXT DEFAULT '';

-- Linked domains (array of domain strings)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS domains TEXT[] DEFAULT '{}';
