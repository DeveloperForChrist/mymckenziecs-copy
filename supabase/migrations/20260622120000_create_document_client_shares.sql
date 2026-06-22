BEGIN;

CREATE TABLE IF NOT EXISTS public.document_client_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  matter_id UUID NOT NULL REFERENCES public.client_matters(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT document_client_shares_unique UNIQUE (document_id, matter_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_document_client_shares_client_active
  ON public.document_client_shares (client_id, matter_id, created_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_client_shares_document_active
  ON public.document_client_shares (document_id, client_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.document_client_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients view active document shares" ON public.document_client_shares;
CREATE POLICY "Clients view active document shares"
  ON public.document_client_shares
  FOR SELECT
  TO authenticated
  USING (
    client_id = (SELECT auth.uid())
    AND revoked_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.client_business_links link
      WHERE link.client_id = (SELECT auth.uid())
        AND link.business_id = document_client_shares.business_id
        AND link.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Service role manages document shares" ON public.document_client_shares;
CREATE POLICY "Service role manages document shares"
  ON public.document_client_shares
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

COMMIT;
