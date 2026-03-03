-- Improve query performance for high-traffic list and analytics endpoints.

CREATE INDEX IF NOT EXISTS idx_cases_user_last_accessed_live
  ON public.cases (user_id, last_accessed DESC, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by_created_live
  ON public.documents (uploaded_by, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp_desc
  ON public.messages (conversation_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_created_at_desc
  ON public.api_usage (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at_desc
  ON public.audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.count_active_case_users_since(p_since timestamptz)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT c.user_id)::bigint
  FROM public.cases c
  WHERE c.last_accessed >= p_since
    AND c.user_id IS NOT NULL
    AND c.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.count_active_case_users_since(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_case_users_since(timestamptz) TO service_role;
