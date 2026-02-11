-- Migration: Create api_usage table for external API cost & usage tracking

CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  endpoint TEXT,
  model TEXT,
  request_type TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  status_code INTEGER,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd NUMERIC(12, 6),
  latency_ms INTEGER,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_model ON api_usage(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_success ON api_usage(success, created_at DESC);
