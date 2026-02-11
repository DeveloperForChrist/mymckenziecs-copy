-- Optional analytics fields for device and session metrics
ALTER TABLE message_analytics
  ADD COLUMN IF NOT EXISTS device_type TEXT,
  ADD COLUMN IF NOT EXISTS os TEXT,
  ADD COLUMN IF NOT EXISTS browser TEXT,
  ADD COLUMN IF NOT EXISTS session_message_count INTEGER,
  ADD COLUMN IF NOT EXISTS session_duration_sec INTEGER;
