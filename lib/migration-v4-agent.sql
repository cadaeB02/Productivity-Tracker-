-- Agent Token Migration
-- Run this in your Supabase SQL Editor

-- Add agent token column to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agent_token TEXT DEFAULT '';

-- Add agent_name column to track which agent is connected
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS agent_name TEXT DEFAULT '';
