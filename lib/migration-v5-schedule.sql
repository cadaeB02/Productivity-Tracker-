-- ============================================================
-- FocusArch / Parallax V5.0 Migration: Schedule Tracker
-- Run this in your Supabase SQL Editor
-- ============================================================

-- ==================== COMPANIES: Recurring Days ====================

ALTER TABLE companies ADD COLUMN IF NOT EXISTS recurring_work_days INTEGER[] DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_start_time TIME DEFAULT '09:00';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_end_time TIME DEFAULT '17:00';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_clock_enabled BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auto_clock_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- ==================== SCHEDULE BLOCKS ====================
-- Planned time blocks on the calendar (recurring or one-off)

CREATE TABLE IF NOT EXISTS schedule_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  date DATE,                          -- specific date (null if purely recurring)
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  color TEXT DEFAULT '#6366f1',
  block_type TEXT DEFAULT 'custom',   -- 'physical_job', 'planned', 'custom'
  is_recurring BOOLEAN DEFAULT false,
  recurring_days INTEGER[] DEFAULT '{}', -- 0=Sun,1=Mon,...6=Sat
  is_exception BOOLEAN DEFAULT false, -- true = skip this recurring day
  exception_date DATE,                -- which date this exception applies to
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== SCHEDULE TASKS ====================
-- Quick-jot task items with duration estimates

CREATE TABLE IF NOT EXISTS schedule_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  duration_estimate TEXT DEFAULT 'unknown', -- 'short', 'medium', 'long', 'unknown'
  scheduled_date DATE,                      -- null = unscheduled
  scheduled_start_time TIME,
  scheduled_end_time TIME,
  status TEXT DEFAULT 'pending',            -- 'pending', 'scheduled', 'done'
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ==================== AUTO CLOCK RULES ====================
-- Rules for automatically starting sessions

CREATE TABLE IF NOT EXISTS auto_clock_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  day_of_week INTEGER NOT NULL,       -- 0=Sun,1=Mon,...6=Sat
  start_time TIME NOT NULL,
  end_time TIME,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==================== SLEEP LOGS ====================
-- Daily wake/sleep times

CREATE TABLE IF NOT EXISTS sleep_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  wake_time TIMESTAMPTZ,
  sleep_time TIMESTAMPTZ,
  source TEXT DEFAULT 'manual',       -- 'manual', 'apple_health'
  quality TEXT DEFAULT '',            -- optional quality note
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_clock_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;

-- schedule_blocks
CREATE POLICY "Users can view own schedule_blocks" ON schedule_blocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own schedule_blocks" ON schedule_blocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own schedule_blocks" ON schedule_blocks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own schedule_blocks" ON schedule_blocks FOR DELETE USING (auth.uid() = user_id);

-- schedule_tasks
CREATE POLICY "Users can view own schedule_tasks" ON schedule_tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own schedule_tasks" ON schedule_tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own schedule_tasks" ON schedule_tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own schedule_tasks" ON schedule_tasks FOR DELETE USING (auth.uid() = user_id);

-- auto_clock_rules
CREATE POLICY "Users can view own auto_clock_rules" ON auto_clock_rules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own auto_clock_rules" ON auto_clock_rules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own auto_clock_rules" ON auto_clock_rules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own auto_clock_rules" ON auto_clock_rules FOR DELETE USING (auth.uid() = user_id);

-- sleep_logs
CREATE POLICY "Users can view own sleep_logs" ON sleep_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own sleep_logs" ON sleep_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sleep_logs" ON sleep_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sleep_logs" ON sleep_logs FOR DELETE USING (auth.uid() = user_id);
