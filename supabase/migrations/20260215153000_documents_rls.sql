-- Enforce per-user access controls on documents.

-- documents
ALTER TABLE IF EXISTS public.documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documents'
      AND policyname = 'documents_service_role_all'
  ) THEN
    CREATE POLICY documents_service_role_all
      ON public.documents
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- Authenticated users can SELECT documents they uploaded OR documents attached to cases they own.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documents'
      AND policyname = 'documents_select_own'
  ) THEN
    CREATE POLICY documents_select_own
      ON public.documents
      FOR SELECT
      TO authenticated
      USING (
        (uploaded_by = auth.uid())
        OR (
          case_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.cases c
            WHERE c.id = documents.case_id
              AND c.user_id = auth.uid()
          )
        )
      );
  END IF;
END
$$;

-- INSERT: must be owned by auth user; if case_id is provided, the case must belong to auth user.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documents'
      AND policyname = 'documents_insert_own'
  ) THEN
    CREATE POLICY documents_insert_own
      ON public.documents
      FOR INSERT
      TO authenticated
      WITH CHECK (
        uploaded_by = auth.uid()
        AND (
          case_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.cases c
            WHERE c.id = documents.case_id
              AND c.user_id = auth.uid()
          )
        )
      );
  END IF;
END
$$;

-- UPDATE: only if the user already has access, and ownership stays with them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documents'
      AND policyname = 'documents_update_own'
  ) THEN
    CREATE POLICY documents_update_own
      ON public.documents
      FOR UPDATE
      TO authenticated
      USING (
        (uploaded_by = auth.uid())
        OR (
          case_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.cases c
            WHERE c.id = documents.case_id
              AND c.user_id = auth.uid()
          )
        )
      )
      WITH CHECK (
        uploaded_by = auth.uid()
        AND (
          case_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM public.cases c
            WHERE c.id = documents.case_id
              AND c.user_id = auth.uid()
          )
        )
      );
  END IF;
END
$$;

-- DELETE: only if the user has access.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documents'
      AND policyname = 'documents_delete_own'
  ) THEN
    CREATE POLICY documents_delete_own
      ON public.documents
      FOR DELETE
      TO authenticated
      USING (
        (uploaded_by = auth.uid())
        OR (
          case_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.cases c
            WHERE c.id = documents.case_id
              AND c.user_id = auth.uid()
          )
        )
      );
  END IF;
END
$$;


-- document_analyses: users can read analyses only for documents they can access.
ALTER TABLE IF EXISTS public.document_analyses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'document_analyses'
      AND policyname = 'document_analyses_service_role_all'
  ) THEN
    CREATE POLICY document_analyses_service_role_all
      ON public.document_analyses
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
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'document_analyses'
      AND policyname = 'document_analyses_select_via_documents'
  ) THEN
    CREATE POLICY document_analyses_select_via_documents
      ON public.document_analyses
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.documents d
          WHERE d.id = document_analyses.document_id
            AND (
              d.uploaded_by = auth.uid()
              OR (
                d.case_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                  FROM public.cases c
                  WHERE c.id = d.case_id
                    AND c.user_id = auth.uid()
                )
              )
            )
        )
      );
  END IF;
END
$$;
