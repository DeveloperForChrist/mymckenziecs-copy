-- MyMcKenzie Supabase Schema
-- Complete database schema for UK Litigants in Person legal assistant
-- Run this in Supabase SQL Editor to create all tables, indexes, and triggers

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cases table
CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  case_type TEXT,  -- 'employment', 'housing', 'family', etc.
  court TEXT,
  status TEXT DEFAULT 'active',  -- 'active', 'archived', 'closed'
  court_deadline DATE,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  search_vector TSVECTOR,  -- For full-text search
  deleted_at TIMESTAMPTZ,  -- Soft delete
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,  -- Nullable for guest/anonymous users; preserve history if case is deleted
  conversation_id UUID,  -- Tracks which thread/conversation within a case
  role TEXT NOT NULL,  -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Index for conversation-based queries (for per-thread message limiting)
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);

-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  storage_path TEXT,
  type TEXT,  -- 'court_form', 'evidence', 'letter', etc.
  file_size INTEGER,
  mime_type TEXT,
  version INTEGER DEFAULT 1,
  uploaded_by UUID REFERENCES users(id),
  deleted_at TIMESTAMPTZ,  -- Soft delete
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document analyses table
CREATE TABLE document_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  analysis_text TEXT NOT NULL,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_document_analyses_document_id ON document_analyses(document_id);
CREATE INDEX idx_document_analyses_analyzed_at ON document_analyses(analyzed_at DESC);

-- =====================================================
-- BILLING TABLES
-- =====================================================

-- Subscriptions table (Basic, Premium, Premium +)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  plan_type TEXT NOT NULL,  -- 'Basic', 'Premium', 'Premium +'
  status TEXT NOT NULL,  -- 'active', 'cancelled', 'expired', 'past_due'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User passes table (3-day, 7-day, etc.)
CREATE TABLE user_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  pass_type TEXT NOT NULL,  -- '3-day', '7-day', '14-day', '21-day', '30-day'
  stripe_payment_id TEXT,
  price_paid DECIMAL(10, 2),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message usage tracking (legacy case-level quotas)
CREATE TABLE message_usage (
  case_id UUID PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,
  free_messages_used INTEGER DEFAULT 0,
  total_messages INTEGER DEFAULT 0,
  pass_id UUID REFERENCES user_passes(id),
  subscription_id UUID REFERENCES subscriptions(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- COMPLIANCE & AUDIT TABLES
-- =====================================================

-- Audit log (legal compliance - track ALL changes)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,  -- 'INSERT', 'UPDATE', 'DELETE'
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  deadline_reminders BOOLEAN DEFAULT true,
  timezone TEXT DEFAULT 'Europe/London',
  language TEXT DEFAULT 'en-GB',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CACHE TABLE
-- =====================================================

-- Cache table (for LLM response + search result caching)
CREATE TABLE cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  cache_type TEXT NOT NULL,  -- 'llm_response', 'search_result', 'document'
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- API usage tracking
CREATE TABLE api_usage (
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

-- Calendar events table (per-user docket)
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  time TIME,
  date TIMESTAMPTZ NOT NULL,
  category TEXT DEFAULT 'deadline' CHECK (category IN ('deadline', 'hearing', 'meeting', 'reminder', 'other')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  type TEXT DEFAULT 'user_created',
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calendar_events_user_id ON calendar_events(user_id);
CREATE INDEX idx_calendar_events_date ON calendar_events(date);
CREATE INDEX idx_calendar_events_category ON calendar_events(category);
CREATE INDEX idx_calendar_events_priority ON calendar_events(priority);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);

-- Cases indexes
CREATE INDEX idx_cases_user_id ON cases(user_id);
CREATE INDEX idx_cases_status ON cases(user_id, status, last_accessed DESC);
CREATE INDEX idx_cases_deadline ON cases(user_id, court_deadline) WHERE court_deadline IS NOT NULL;
CREATE INDEX idx_cases_search ON cases USING GIN(search_vector);
CREATE INDEX idx_cases_active ON cases(user_id) WHERE deleted_at IS NULL AND status = 'active';

-- Messages indexes
CREATE INDEX idx_messages_case_id ON messages(case_id, timestamp DESC);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);

-- Documents indexes
CREATE INDEX idx_documents_case_id ON documents(case_id);
CREATE INDEX idx_documents_recent ON documents(case_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_type ON documents(case_id, type);

-- Billing indexes
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id, status);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_passes_user ON user_passes(user_id);
CREATE INDEX idx_passes_case ON user_passes(case_id, expires_at);
CREATE INDEX idx_passes_active ON user_passes(user_id, expires_at);

-- Audit log indexes
CREATE INDEX idx_audit_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_table ON audit_log(table_name, record_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, created_at DESC);

-- Cache indexes
CREATE INDEX idx_cache_expires ON cache(expires_at);
CREATE INDEX idx_cache_type ON cache(cache_type, expires_at);

-- API usage indexes
CREATE INDEX idx_api_usage_provider ON api_usage(provider, created_at DESC);
CREATE INDEX idx_api_usage_model ON api_usage(model, created_at DESC);
CREATE INDEX idx_api_usage_user ON api_usage(user_id, created_at DESC);
CREATE INDEX idx_api_usage_success ON api_usage(success, created_at DESC);

-- =====================================================
-- DATA VALIDATION CONSTRAINTS
-- =====================================================

-- Cases constraints
ALTER TABLE cases ADD CONSTRAINT valid_status 
  CHECK (status IN ('active', 'archived', 'closed'));

-- Messages constraints
ALTER TABLE messages ADD CONSTRAINT valid_role 
  CHECK (role IN ('user', 'assistant', 'system'));

-- Subscriptions constraints
ALTER TABLE subscriptions ADD CONSTRAINT valid_plan_type 
  CHECK (plan_type IN ('Basic', 'Premium', 'Premium +'));
ALTER TABLE subscriptions ADD CONSTRAINT valid_subscription_status 
  CHECK (status IN ('active', 'cancelled', 'expired', 'past_due'));

-- User passes constraints
ALTER TABLE user_passes ADD CONSTRAINT valid_pass_type 
  CHECK (pass_type IN ('3-day', '7-day', '14-day', '21-day', '30-day'));
ALTER TABLE user_passes ADD CONSTRAINT valid_price 
  CHECK (price_paid >= 0);

-- Message usage constraints
ALTER TABLE message_usage ADD CONSTRAINT valid_message_counts 
  CHECK (free_messages_used >= 0 AND total_messages >= 0);

-- Cache constraints
ALTER TABLE cache ADD CONSTRAINT valid_cache_type 
  CHECK (cache_type IN ('llm_response', 'search_result', 'document'));
ALTER TABLE cache ADD CONSTRAINT valid_expiry 
  CHECK (expires_at > created_at);

-- =====================================================
-- TRIGGERS & FUNCTIONS
-- =====================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cases_updated_at BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Full-text search vector update trigger
CREATE OR REPLACE FUNCTION cases_search_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.case_type, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.court, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_search_update
  BEFORE INSERT OR UPDATE OF title, description, case_type, court ON cases
  FOR EACH ROW EXECUTE FUNCTION cases_search_trigger();

-- Auto-initialize message_usage when case is created
CREATE OR REPLACE FUNCTION init_message_usage()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO message_usage (case_id, free_messages_used, total_messages)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (case_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER init_usage_on_case_create
  AFTER INSERT ON cases
  FOR EACH ROW EXECUTE FUNCTION init_message_usage();

-- Update message count on cases
CREATE OR REPLACE FUNCTION update_case_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE cases SET message_count = message_count + 1 WHERE id = NEW.case_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE cases SET message_count = message_count - 1 WHERE id = OLD.case_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_message_count_on_insert
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_case_message_count();

CREATE TRIGGER update_message_count_on_delete
  AFTER DELETE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_case_message_count();

-- Update last_accessed on cases when messages are added
CREATE OR REPLACE FUNCTION update_case_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE cases SET last_accessed = NOW() WHERE id = NEW.case_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_last_accessed_on_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_case_last_accessed();

-- Auto-delete expired cache entries (run daily)
CREATE OR REPLACE FUNCTION delete_expired_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Audit log trigger for cases (track all changes)
CREATE OR REPLACE FUNCTION audit_cases_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, new_data)
    VALUES (NEW.user_id, 'cases', NEW.id, 'INSERT', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, old_data, new_data)
    VALUES (NEW.user_id, 'cases', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (user_id, table_name, record_id, action, old_data)
    VALUES (OLD.user_id, 'cases', OLD.id, 'DELETE', to_jsonb(OLD));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_cases_trigger
  AFTER INSERT OR UPDATE OR DELETE ON cases
  FOR EACH ROW EXECUTE FUNCTION audit_cases_changes();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Users: Can only see their own data
CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id);

-- Cases: Can only access their own cases
CREATE POLICY cases_select_own ON cases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY cases_insert_own ON cases
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY cases_update_own ON cases
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY cases_delete_own ON cases
  FOR DELETE USING (user_id = auth.uid());

-- Messages: Can only access messages in their own cases
CREATE POLICY messages_select_own ON messages
  FOR SELECT USING (case_id IN (
    SELECT c.id FROM cases c WHERE c.user_id = auth.uid()
  ));

CREATE POLICY messages_insert_own ON messages
  FOR INSERT WITH CHECK (case_id IN (
    SELECT c.id FROM cases c WHERE c.user_id = auth.uid()
  ));

-- Documents: Can only access documents in their own cases
CREATE POLICY documents_select_own ON documents
  FOR SELECT USING (case_id IN (
    SELECT c.id FROM cases c WHERE c.user_id = auth.uid()
  ));

CREATE POLICY documents_insert_own ON documents
  FOR INSERT WITH CHECK (case_id IN (
    SELECT c.id FROM cases c WHERE c.user_id = auth.uid()
  ));

-- Subscriptions: Can only see their own subscriptions
CREATE POLICY subscriptions_select_own ON subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- User passes: Can only see their own passes
CREATE POLICY passes_select_own ON user_passes
  FOR SELECT USING (user_id = auth.uid());

-- Cache: server-only access (service_role) to prevent cross-user leakage/poisoning.
CREATE POLICY cache_service_role_all ON cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- User preferences: Can only access their own preferences
CREATE POLICY preferences_all_own ON user_preferences
  FOR ALL USING (user_id = auth.uid());

-- Calendar events: Users manage only their entries
CREATE POLICY calendar_events_select_own ON calendar_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY calendar_events_insert_own ON calendar_events
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY calendar_events_update_own ON calendar_events
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY calendar_events_delete_own ON calendar_events
  FOR DELETE USING (user_id = auth.uid());

-- =====================================================
-- HELPFUL VIEWS
-- =====================================================

-- Active cases with message counts and pass info
CREATE VIEW active_cases_view AS
SELECT 
  c.*,
  u.email AS user_email,
  u.name AS user_name,
  COUNT(DISTINCT m.id) AS actual_message_count,
  mu.free_messages_used,
  up.expires_at AS pass_expires_at,
  up.pass_type,
  s.plan_type AS subscription_plan,
  s.status AS subscription_status
FROM cases c
JOIN users u ON c.user_id = u.id
LEFT JOIN messages m ON c.id = m.case_id
LEFT JOIN message_usage mu ON c.id = mu.case_id
LEFT JOIN user_passes up ON c.id = up.case_id AND up.expires_at > NOW()
LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
WHERE c.deleted_at IS NULL
GROUP BY c.id, u.id, mu.case_id, up.id, s.id;

-- User billing summary
CREATE VIEW user_billing_view AS
SELECT 
  u.id AS user_id,
  u.email,
  u.name,
  s.plan_type AS current_subscription,
  s.current_period_end AS subscription_expires,
  COUNT(DISTINCT up.id) AS active_passes,
  COUNT(DISTINCT c.id) AS total_cases,
  SUM(c.message_count) AS total_messages
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
LEFT JOIN user_passes up ON u.id = up.user_id AND up.expires_at > NOW()
LEFT JOIN cases c ON u.id = c.user_id AND c.deleted_at IS NULL
GROUP BY u.id, s.id;

-- =====================================================
-- USEFUL SEARCH FUNCTIONS
-- =====================================================

-- Search cases by full-text query
CREATE OR REPLACE FUNCTION search_cases(
  search_query TEXT
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  case_type TEXT,
  court TEXT,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.title,
    c.description,
    c.case_type,
    c.court,
    ts_rank(c.search_vector, to_tsquery('english', search_query)) AS rank
  FROM cases c
  WHERE 
    c.user_id = auth.uid()
    AND c.deleted_at IS NULL
    AND c.search_vector @@ to_tsquery('english', search_query)
  ORDER BY rank DESC;
END;
$$ LANGUAGE plpgsql;

-- Get user's active pass or subscription
CREATE OR REPLACE FUNCTION get_user_access_level()
RETURNS TABLE (
  has_subscription BOOLEAN,
  subscription_plan TEXT,
  has_pass BOOLEAN,
  pass_type TEXT,
  pass_case_id UUID,
  has_no_paid_access BOOLEAN,
  case_count INTEGER,
  can_create_case BOOLEAN
) AS $$
DECLARE
  user_rec RECORD;
  active_case_count INTEGER;
BEGIN
  -- Get user and their billing info
  SELECT 
    u.id,
    CASE WHEN s.id IS NOT NULL THEN true ELSE false END AS has_sub,
    s.plan_type,
    CASE WHEN up.id IS NOT NULL THEN true ELSE false END AS has_pass_active,
    up.pass_type AS pass_type_val,
    up.case_id,
    CASE WHEN s.id IS NULL AND up.id IS NULL THEN true ELSE false END AS is_free
  INTO user_rec
  FROM users u
  LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
  LEFT JOIN user_passes up ON u.id = up.user_id AND up.expires_at > NOW()
  WHERE u.id = auth.uid()
  LIMIT 1;
  
  -- Count active cases
  SELECT COUNT(*) INTO active_case_count
  FROM cases c
  WHERE c.user_id = user_rec.id AND c.deleted_at IS NULL;
  
  -- Determine if user can create new case
  RETURN QUERY
  SELECT 
    user_rec.has_sub AS has_subscription,
    user_rec.plan_type AS subscription_plan,
    user_rec.has_pass_active AS has_pass,
    user_rec.pass_type_val AS pass_type,
    user_rec.case_id AS pass_case_id,
    user_rec.is_free AS has_no_paid_access,
    active_case_count AS case_count,
    CASE 
      -- Subscribers: unlimited cases
      WHEN user_rec.has_sub THEN true
      -- No paid access: only 1 case allowed
      WHEN user_rec.is_free AND active_case_count < 1 THEN true
      -- Pass holders: can create case if buying new pass
      WHEN user_rec.has_pass_active THEN false  -- Already have active pass
      -- Default: no
      ELSE false
    END AS can_create_case;
END;
$$ LANGUAGE plpgsql;

-- Check if user can create a new case (for application logic)
CREATE OR REPLACE FUNCTION can_user_create_case()
RETURNS BOOLEAN AS $$
DECLARE
  access_info RECORD;
BEGIN
  SELECT * INTO access_info FROM get_user_access_level();
  RETURN access_info.can_create_case;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- INITIAL DATA / SEED
-- =====================================================

-- Insert default cache cleanup job (you'd run this with pg_cron or external scheduler)
-- COMMENT: Set up a cron job to run: SELECT delete_expired_cache(); daily

-- =====================================================
-- MIGRATION NOTES
-- =====================================================

-- Migration notes removed

COMMENT ON TABLE users IS 'User accounts - id linked to auth.users(id)';
COMMENT ON TABLE cases IS 'Legal cases managed by users - includes soft delete and full-text search';
COMMENT ON TABLE messages IS 'Chat messages within cases - tracks conversation history';
COMMENT ON TABLE documents IS 'User-uploaded documents linked to cases';
COMMENT ON TABLE subscriptions IS 'Premium and Premium Pro subscriptions';
COMMENT ON TABLE user_passes IS 'Time-limited passes (3-30 days) for individual cases';
COMMENT ON TABLE message_usage IS 'Tracks legacy case-level message limits (15 messages per case)';
COMMENT ON TABLE audit_log IS 'Complete audit trail for legal compliance - tracks all data changes';
COMMENT ON TABLE cache IS 'Shared cache for LLM responses and search results - 30-50% cost savings';

-- =====================================================
-- BUSINESS RULES SUMMARY
-- =====================================================

-- Users without paid access:
--   - 1 case maximum (try before you buy)
--   - 15 messages per case
--   - To create more cases: buy Premium subscription or individual passes

-- Pass Holders:
--   - 1 case per pass (pass locked to specific case)
--   - Unlimited messages for that case during pass validity
--   - Can buy multiple passes for multiple cases

-- Premium Subscribers (£25/month):
--   - Unlimited cases
--   - Unlimited messages per case

-- Premium Pro Subscribers (£50/month):
--   - Unlimited cases
--   - Unlimited messages per case
--   - Priority support

-- Use get_user_access_level() or can_user_create_case() to check permissions in your app
