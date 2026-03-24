-- Add description/notes column to tasks table
-- Run this in your Supabase SQL Editor

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
