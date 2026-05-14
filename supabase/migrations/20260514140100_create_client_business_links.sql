-- Client-business links (connects clients to businesses after signup)
CREATE TABLE IF NOT EXISTS public.client_business_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  client_name TEXT,
  client_email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_client_business UNIQUE (client_id, business_id)
);

CREATE INDEX IF NOT EXISTS client_business_links_client_idx ON public.client_business_links(client_id);
CREATE INDEX IF NOT EXISTS client_business_links_business_idx ON public.client_business_links(business_id);
CREATE INDEX IF NOT EXISTS client_business_links_status_idx ON public.client_business_links(status);

ALTER TABLE public.client_business_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients view their business links" ON public.client_business_links;
CREATE POLICY "Clients view their business links"
  ON public.client_business_links
  FOR SELECT
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "Businesses view their client links" ON public.client_business_links;
CREATE POLICY "Businesses view their client links"
  ON public.client_business_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE businesses.id = client_business_links.business_id
      AND businesses.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM business_members
      WHERE business_members.business_id = client_business_links.business_id
      AND business_members.user_id = auth.uid()
      AND business_members.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Service role can manage client business links" ON public.client_business_links;
CREATE POLICY "Service role can manage client business links"
  ON public.client_business_links
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
