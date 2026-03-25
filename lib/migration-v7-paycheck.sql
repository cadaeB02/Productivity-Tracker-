-- Migration: Add paycheck_delay_days to companies table
-- This field stores how many days after a pay period ends until the paycheck hits
-- Default: 6 (e.g., period ends Friday, paycheck hits next Thursday)

ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS paycheck_delay_days integer DEFAULT 6;

-- Tech stack: array of service objects stored as JSONB
ALTER TABLE companies 
ADD COLUMN IF NOT EXISTS tech_stack jsonb DEFAULT '[]'::jsonb;
