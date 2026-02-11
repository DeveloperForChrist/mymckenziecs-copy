-- Analytics table for message metadata (no raw message content stored)
CREATE TABLE IF NOT EXISTS message_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  plan TEXT,
  is_guest BOOLEAN DEFAULT false,
  message_length INTEGER DEFAULT 0,
  intent TEXT,
  has_attachments BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_analytics_created_at ON message_analytics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_analytics_intent ON message_analytics(intent);
