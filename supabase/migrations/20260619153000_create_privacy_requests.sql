-- Track privacy / DSAR requests so they can be reviewed, resolved, and audited.

CREATE TABLE IF NOT EXISTS public.privacy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  request_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  details TEXT NOT NULL DEFAULT '',
  admin_notes TEXT NOT NULL DEFAULT '',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.privacy_requests
  DROP CONSTRAINT IF EXISTS valid_privacy_request_type,
  DROP CONSTRAINT IF EXISTS valid_privacy_request_status;

ALTER TABLE public.privacy_requests
  ADD CONSTRAINT valid_privacy_request_type
    CHECK (request_type = ANY (ARRAY['access'::text, 'erasure'::text, 'correction'::text, 'restriction'::text])),
  ADD CONSTRAINT valid_privacy_request_status
    CHECK (status = ANY (ARRAY['pending'::text, 'in_review'::text, 'completed'::text, 'rejected'::text]));

CREATE INDEX IF NOT EXISTS idx_privacy_requests_status_submitted
  ON public.privacy_requests (status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_privacy_requests_user_email
  ON public.privacy_requests (user_email);

ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'privacy_requests'
      AND policyname = 'privacy_requests_service_role_all'
  ) THEN
    CREATE POLICY privacy_requests_service_role_all
      ON public.privacy_requests
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'privacy_requests'
      AND policyname = 'privacy_requests_select_own'
  ) THEN
    CREATE POLICY privacy_requests_select_own
      ON public.privacy_requests
      FOR SELECT
      TO authenticated
      USING ((select auth.uid()) = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'privacy_requests'
      AND policyname = 'privacy_requests_insert_own'
  ) THEN
    CREATE POLICY privacy_requests_insert_own
      ON public.privacy_requests
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (select auth.uid()) = user_id
        AND user_email = auth.email()
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.touch_privacy_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_privacy_requests_touch_updated_at ON public.privacy_requests;
CREATE TRIGGER trg_privacy_requests_touch_updated_at
BEFORE UPDATE ON public.privacy_requests
FOR EACH ROW
EXECUTE FUNCTION public.touch_privacy_requests_updated_at();
