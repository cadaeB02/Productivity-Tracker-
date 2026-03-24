-- Add flagged column to documents table
-- Run this in your Supabase SQL Editor

ALTER TABLE documents ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false;

-- Add flagged column to notes table (using existing 'pinned' would also work,
-- but having a separate 'flagged' gives more flexibility)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false;
