-- ============================================================
-- SDLX Tracker: Schedule Redesign Migration
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Add task_size to schedule_tasks for the new Small/Med/Large sizing
ALTER TABLE schedule_tasks ADD COLUMN IF NOT EXISTS task_size TEXT DEFAULT 'small'; -- 'small', 'medium', 'large'

