-- Harden message_usage RLS and storage bucket access policies.

-- 1) message_usage: ensure RLS is enabled and policies are explicit.
ALTER TABLE IF EXISTS public.message_usage ENABLE ROW LEVEL SECURITY;

-- Allow service role to bypass user-scoped checks for server-side jobs/routes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_usage'
      AND policyname = 'message_usage_service_role_all'
  ) THEN
    CREATE POLICY message_usage_service_role_all
      ON public.message_usage
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- Authenticated users can read rows tied to their own cases.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_usage'
      AND policyname = 'message_usage_select_own'
  ) THEN
    CREATE POLICY message_usage_select_own
      ON public.message_usage
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.cases c
          WHERE c.id = message_usage.case_id
            AND c.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- Authenticated users can insert rows only for their own cases.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_usage'
      AND policyname = 'message_usage_insert_own'
  ) THEN
    CREATE POLICY message_usage_insert_own
      ON public.message_usage
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.cases c
          WHERE c.id = message_usage.case_id
            AND c.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- Authenticated users can update only their own case rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_usage'
      AND policyname = 'message_usage_update_own'
  ) THEN
    CREATE POLICY message_usage_update_own
      ON public.message_usage
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.cases c
          WHERE c.id = message_usage.case_id
            AND c.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.cases c
          WHERE c.id = message_usage.case_id
            AND c.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- Optional: authenticated users can delete only their own case rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_usage'
      AND policyname = 'message_usage_delete_own'
  ) THEN
    CREATE POLICY message_usage_delete_own
      ON public.message_usage
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.cases c
          WHERE c.id = message_usage.case_id
            AND c.user_id = auth.uid()
        )
      );
  END IF;
END
$$;

-- Keep updated_at fresh on write.
CREATE OR REPLACE FUNCTION public.touch_message_usage_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_usage_touch_updated_at ON public.message_usage;
CREATE TRIGGER trg_message_usage_touch_updated_at
BEFORE UPDATE ON public.message_usage
FOR EACH ROW
EXECUTE FUNCTION public.touch_message_usage_updated_at();


-- 2) Storage: enforce per-user path ownership for document uploads.
-- Bucket is idempotently created/updated if missing.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('user-uploads', 'user-uploads', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit;

-- Remove older broad policies if present.
DROP POLICY IF EXISTS "Users can read own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own uploads" ON storage.objects;

-- New strict policies: object key must start with "<auth.uid()>/..."
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'user_uploads_select_own_prefix'
  ) THEN
    CREATE POLICY user_uploads_select_own_prefix
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'user-uploads'
        AND auth.uid() IS NOT NULL
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'user_uploads_insert_own_prefix'
  ) THEN
    CREATE POLICY user_uploads_insert_own_prefix
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'user-uploads'
        AND auth.uid() IS NOT NULL
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'user_uploads_update_own_prefix'
  ) THEN
    CREATE POLICY user_uploads_update_own_prefix
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'user-uploads'
        AND auth.uid() IS NOT NULL
        AND split_part(name, '/', 1) = auth.uid()::text
      )
      WITH CHECK (
        bucket_id = 'user-uploads'
        AND auth.uid() IS NOT NULL
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'user_uploads_delete_own_prefix'
  ) THEN
    CREATE POLICY user_uploads_delete_own_prefix
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'user-uploads'
        AND auth.uid() IS NOT NULL
        AND split_part(name, '/', 1) = auth.uid()::text
      );
  END IF;
END
$$;
