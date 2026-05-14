-- Client invitations (used by businesses to invite clients to their portal)
CREATE TABLE IF NOT EXISTS public.client_invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  inviter_id UUID REFERENCES auth.users(id),
  inviter_email TEXT,
  invited_email TEXT NOT NULL,
  client_name TEXT,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'base64'),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS client_invitations_business_idx ON public.client_invitations(business_id);
CREATE INDEX IF NOT EXISTS client_invitations_token_idx ON public.client_invitations(token);
CREATE INDEX IF NOT EXISTS client_invitations_email_idx ON public.client_invitations(invited_email);
CREATE INDEX IF NOT EXISTS client_invitations_status_idx ON public.client_invitations(status);

ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Businesses manage client invitations" ON public.client_invitations;
CREATE POLICY "Businesses manage client invitations"
  ON public.client_invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE businesses.id = client_invitations.business_id
      AND businesses.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = client_invitations.business_id
      AND business_members.user_id = auth.uid()
      AND business_members.status = 'active'
      AND business_members.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Clients view their invitations" ON public.client_invitations;
CREATE POLICY "Clients view their invitations"
  ON public.client_invitations
  FOR SELECT
  USING (invited_email = auth.email());

DROP POLICY IF EXISTS "Clients accept their invitations" ON public.client_invitations;
CREATE POLICY "Clients accept their invitations"
  ON public.client_invitations
  FOR UPDATE
  USING (
    invited_email = auth.email()
    AND status = 'pending'
  );

DROP POLICY IF EXISTS "Service role can manage client invitations" ON public.client_invitations;
CREATE POLICY "Service role can manage client invitations"
  ON public.client_invitations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
