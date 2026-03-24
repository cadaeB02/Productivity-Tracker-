-- V6 Notes Hub Migration
-- Run this in your Supabase SQL Editor

CREATE TABLE notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  category TEXT NOT NULL DEFAULT 'inbox'
    CHECK (category IN ('inbox', 'todo', 'ideas', 'passwords', 'reference')),
  title TEXT DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  is_encrypted BOOLEAN DEFAULT false,
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Row Level Security
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes"
  ON notes FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own notes"
  ON notes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notes"
  ON notes FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notes"
  ON notes FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_notes_user ON notes (user_id);
CREATE INDEX idx_notes_category ON notes (category);
CREATE INDEX idx_notes_company ON notes (company_id);
CREATE INDEX idx_notes_pinned ON notes (pinned DESC, updated_at DESC);
