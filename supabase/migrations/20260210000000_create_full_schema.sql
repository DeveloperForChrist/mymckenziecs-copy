-- Consolidated schema migration generated from scripts/supabase/schema.sql
-- Run with Supabase CLI or in the Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core tables, indexes, constraints, and policies
-- (Full schema from scripts/supabase/schema.sql)

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  country_code TEXT,
  jurisdiction_code TEXT,
  jurisdiction_label TEXT,
  freemium_since TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cases table
CREATE TABLE IF NOT EXISTS cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  case_type TEXT,
  external_id TEXT,
  court TEXT,
  status TEXT DEFAULT 'active',
  court_deadline DATE,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  search_vector TSVECTOR,
  deleted_at TIMESTAMPTZ,
  checklist_documents JSONB,
  checklist_procedural JSONB,
  checklist_actions JSONB,
  checklist_updated_at TIMESTAMPTZ,
  checklist_auto_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  conversation_id UUID,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  storage_path TEXT,
  type TEXT,
  file_size INTEGER,
  mime_type TEXT,
  version INTEGER DEFAULT 1,
  uploaded_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  analysis_text TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_analyses_document_id ON document_analyses(document_id);
CREATE INDEX IF NOT EXISTS idx_document_analyses_analyzed_at ON document_analyses(analyzed_at DESC);

-- Subscriptions / pricing
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  plan_type TEXT NOT NULL,
  status TEXT NOT NULL,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  scheduled_plan_type TEXT,
  scheduled_change_at TIMESTAMPTZ,
  past_due_since TIMESTAMPTZ,
  grace_period_end TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ,
  grace_day3_sent_at TIMESTAMPTZ,
  grace_day6_sent_at TIMESTAMPTZ,
  trial_reminder_days_sent JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  pass_type TEXT NOT NULL,
  stripe_payment_id TEXT,
  price_paid DECIMAL(10,2),
  expires_at TIMESTAMPTZ NOT NULL,
  reminder_14_sent_at TIMESTAMPTZ,
  reminder_7_sent_at TIMESTAMPTZ,
  reminder_5_sent_at TIMESTAMPTZ,
  reminder_3_sent_at TIMESTAMPTZ,
  reminder_1_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS message_usage (
  case_id UUID PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  free_messages_used INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  pass_id UUID REFERENCES user_passes(id),
  subscription_id UUID REFERENCES subscriptions(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit & preferences
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  deadline_reminders BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'Europe/London',
  language TEXT DEFAULT 'en-GB',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cache / api usage
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  cache_type TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_uploads (
  id TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  extracted_text TEXT,
  extract_status TEXT NOT NULL DEFAULT 'pending',
  extracted_at TIMESTAMPTZ,
  extract_error TEXT
);

CREATE TABLE IF NOT EXISTS user_entitlements (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL DEFAULT 'No plan',
  plan_status TEXT NOT NULL DEFAULT 'inactive',
  next_billing_date TIMESTAMPTZ,
  has_stripe_customer BOOLEAN NOT NULL DEFAULT false,
  paid_access BOOLEAN NOT NULL DEFAULT false,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  can_resume BOOLEAN NOT NULL DEFAULT false,
  archive_at TIMESTAMPTZ,
  delete_at TIMESTAMPTZ,
  scheduled_plan_type TEXT,
  scheduled_change_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_metric_rollups (
  period_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.increment_chat_memory_turn_count(
  p_memory_key TEXT,
  p_user_id UUID,
  p_guest_id UUID,
  p_case_id UUID,
  p_conversation_id UUID,
  p_last_intent TEXT,
  p_memory_summary TEXT DEFAULT NULL,
  p_key_facts JSONB DEFAULT '[]'::jsonb,
  p_open_questions JSONB DEFAULT '[]'::jsonb
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_count INTEGER;
BEGIN
  INSERT INTO public.chat_memory (
    memory_key,
    user_id,
    guest_id,
    case_id,
    conversation_id,
    memory_summary,
    key_facts,
    open_questions,
    last_intent,
    user_turn_count
  )
  VALUES (
    p_memory_key,
    p_user_id,
    p_guest_id,
    p_case_id,
    p_conversation_id,
    p_memory_summary,
    COALESCE(p_key_facts, '[]'::jsonb),
    COALESCE(p_open_questions, '[]'::jsonb),
    p_last_intent,
    1
  )
  ON CONFLICT (memory_key)
  DO UPDATE SET
    user_id = COALESCE(EXCLUDED.user_id, public.chat_memory.user_id),
    guest_id = COALESCE(EXCLUDED.guest_id, public.chat_memory.guest_id),
    case_id = COALESCE(EXCLUDED.case_id, public.chat_memory.case_id),
    conversation_id = COALESCE(EXCLUDED.conversation_id, public.chat_memory.conversation_id),
    memory_summary = COALESCE(EXCLUDED.memory_summary, public.chat_memory.memory_summary),
    key_facts = CASE
      WHEN jsonb_typeof(EXCLUDED.key_facts) = 'array' AND jsonb_array_length(EXCLUDED.key_facts) > 0
        THEN EXCLUDED.key_facts
      ELSE public.chat_memory.key_facts
    END,
    open_questions = CASE
      WHEN jsonb_typeof(EXCLUDED.open_questions) = 'array' AND jsonb_array_length(EXCLUDED.open_questions) > 0
        THEN EXCLUDED.open_questions
      ELSE public.chat_memory.open_questions
    END,
    last_intent = COALESCE(EXCLUDED.last_intent, public.chat_memory.last_intent),
    user_turn_count = public.chat_memory.user_turn_count + 1
  RETURNING user_turn_count INTO v_next_count;

  RETURN v_next_count;
END;
$$;

ALTER TABLE user_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own entitlements" ON user_entitlements;
CREATE POLICY "Users can view own entitlements"
  ON user_entitlements
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role can manage entitlements" ON user_entitlements;
CREATE POLICY "Service role can manage entitlements"
  ON user_entitlements
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

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
  cost_usd NUMERIC(12,6),
  latency_ms INTEGER,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar events
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  time TIME,
  date TIMESTAMPTZ NOT NULL,
  category TEXT DEFAULT 'deadline' CHECK (category IN ('deadline','hearing','meeting','reminder','other')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  type TEXT DEFAULT 'user_created',
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date);
CREATE INDEX IF NOT EXISTS idx_calendar_events_category ON calendar_events(category);
CREATE INDEX IF NOT EXISTS idx_calendar_events_priority ON calendar_events(priority);

-- Example indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_cases_user_id ON cases(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(user_id, status, last_accessed DESC);
CREATE INDEX IF NOT EXISTS idx_cases_deadline ON cases(user_id, court_deadline) WHERE court_deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cases_search ON cases USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_cases_active ON cases(user_id) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_messages_case_id ON messages(case_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_change ON subscriptions(scheduled_change_at DESC) WHERE scheduled_plan_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_uploads_owner_expires ON chat_uploads(owner_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_uploads_expires ON chat_uploads(expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_paid_access ON user_entitlements(paid_access, updated_at DESC);

-- Add constraints (make idempotent)
ALTER TABLE IF EXISTS cases DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE IF EXISTS cases ADD CONSTRAINT valid_status CHECK (status IN ('active','archived','closed'));
ALTER TABLE IF EXISTS messages DROP CONSTRAINT IF EXISTS valid_role;
ALTER TABLE IF EXISTS messages ADD CONSTRAINT valid_role CHECK (role IN ('user','assistant','system'));

-- Row level security notes: enable/define in Supabase dashboard as needed
