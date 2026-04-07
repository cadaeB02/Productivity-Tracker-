-- Calendar Cache table for Apple Calendar sync
-- Stores calendar events pushed from the local Mac sync script

CREATE TABLE IF NOT EXISTS calendar_cache (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    events_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    event_count INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE calendar_cache ENABLE ROW LEVEL SECURITY;

-- Users can read their own cache
CREATE POLICY "Users can read own calendar cache"
    ON calendar_cache FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can upsert (from sync script)
CREATE POLICY "Service role can manage calendar cache"
    ON calendar_cache FOR ALL
    USING (true)
    WITH CHECK (true);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_calendar_cache_user ON calendar_cache(user_id);
