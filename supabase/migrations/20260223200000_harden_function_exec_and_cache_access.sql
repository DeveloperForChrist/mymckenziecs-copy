-- Security hardening: least-privilege execution and cache access controls.
-- Aligned with NIST-style controls: deny-by-default, least privilege, and reduced attack surface.

-- 1) Restrict SECURITY DEFINER RPC functions to service_role only.
DO $$
BEGIN
  BEGIN
    REVOKE ALL ON FUNCTION public.claim_reminder_delivery(UUID, DATE, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_reminder_delivery(UUID, DATE, INTEGER, INTEGER, INTEGER) TO service_role;
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  BEGIN
    REVOKE ALL ON FUNCTION public.complete_reminder_delivery(UUID, DATE, INTEGER, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.complete_reminder_delivery(UUID, DATE, INTEGER, BOOLEAN, TEXT) TO service_role;
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  BEGIN
    REVOKE ALL ON FUNCTION public.consume_guest_message(UUID, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.consume_guest_message(UUID, INTEGER, BIGINT) TO service_role;
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;
END
$$;

-- Ensure explicit, safe search_path for SECURITY DEFINER guest usage function.
DO $$
BEGIN
  BEGIN
    ALTER FUNCTION public.consume_guest_message(UUID, INTEGER, BIGINT) SET search_path = public;
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;
END
$$;

-- 2) Lock down cache table: service-role only.
ALTER TABLE IF EXISTS public.cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cache_select_all ON public.cache;
DROP POLICY IF EXISTS cache_insert_all ON public.cache;
DROP POLICY IF EXISTS cache_update_all ON public.cache;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'cache'
      AND policyname = 'cache_service_role_all'
  ) THEN
    CREATE POLICY cache_service_role_all
      ON public.cache
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

REVOKE ALL ON TABLE public.cache FROM anon, authenticated;

-- 3) Defense-in-depth for internal system tables.
-- These are intended for server-side use; revoke direct client role access.
REVOKE ALL ON TABLE public.reminder_delivery_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.guest_message_usage FROM anon, authenticated;
REVOKE ALL ON TABLE public.chat_memory FROM anon, authenticated;
REVOKE ALL ON TABLE public.chat_action_items FROM anon, authenticated;
