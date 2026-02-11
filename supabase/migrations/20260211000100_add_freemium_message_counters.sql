-- Add rolling window counters for freemium message limits (no message content stored)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS freemium_message_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freemium_message_window_start TIMESTAMPTZ;
