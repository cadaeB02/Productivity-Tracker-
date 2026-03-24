-- V6 Filing Cabinet / Documents Migration
-- Run this in your Supabase SQL Editor

-- Step 1: Create the documents table
CREATE TABLE documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER DEFAULT 0,
  file_type TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general'
    CHECK (category IN ('agreement', 'legal', 'tax', 'invoice', 'receipt', 'general')),
  description TEXT DEFAULT '',
  linked_type TEXT DEFAULT NULL,  -- e.g. 'equity_holder'
  linked_id UUID DEFAULT NULL,    -- e.g. the equity_holder row id
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" ON documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create documents" ON documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update documents" ON documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete documents" ON documents FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_documents_company ON documents (company_id);
CREATE INDEX idx_documents_category ON documents (category);
CREATE INDEX idx_documents_linked ON documents (linked_type, linked_id);

-- Step 2: Create Storage Bucket (run this separately if Step 1 works)
-- Go to Supabase Dashboard > Storage > New Bucket
-- Name: "documents"
-- Public: OFF (private)
-- File size limit: 10MB
-- Allowed MIME types: leave empty (allow all)

-- Then add this storage policy:
-- INSERT INTO storage.objects policy: (auth.uid() IS NOT NULL)
-- SELECT FROM storage.objects policy: (auth.uid() IS NOT NULL)
-- DELETE FROM storage.objects policy: (auth.uid() IS NOT NULL)

-- OR run these SQL policies for the storage bucket:
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth users can upload docs" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can read docs" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can delete docs" ON storage.objects
  FOR DELETE USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);
