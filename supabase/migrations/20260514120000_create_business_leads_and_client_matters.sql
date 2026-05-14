-- Persistent business intake and matter tracking.

CREATE TABLE IF NOT EXISTS public.business_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  issue_type TEXT NOT NULL DEFAULT '',
  urgency TEXT NOT NULL DEFAULT 'medium',
  summary TEXT NOT NULL DEFAULT '',
  full_details TEXT NOT NULL DEFAULT '',
  court_date DATE,
  opposing TEXT,
  documents TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'portal',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_business_lead_urgency CHECK (urgency = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])),
  CONSTRAINT valid_business_lead_status CHECK (status = ANY (ARRAY['new'::text, 'accepted'::text, 'declined'::text, 'pending'::text])),
  CONSTRAINT valid_business_lead_source CHECK (source = ANY (ARRAY['portal'::text, 'referral'::text, 'direct'::text]))
);

CREATE TABLE IF NOT EXISTS public.client_matters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.business_leads(id) ON DELETE SET NULL,
  client_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  issue_type TEXT NOT NULL DEFAULT '',
  urgency TEXT NOT NULL DEFAULT 'medium',
  summary TEXT NOT NULL DEFAULT '',
  full_details TEXT NOT NULL DEFAULT '',
  court_date DATE,
  opposing TEXT,
  documents TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  matter_number TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'intake',
  status TEXT NOT NULL DEFAULT 'active',
  owner TEXT NOT NULL DEFAULT 'Unassigned',
  next_action TEXT NOT NULL DEFAULT '',
  next_deadline DATE,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  portal_enabled BOOLEAN NOT NULL DEFAULT false,
  portal_invited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_client_matter_urgency CHECK (urgency = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])),
  CONSTRAINT valid_client_matter_stage CHECK (stage = ANY (ARRAY['intake'::text, 'documents'::text, 'advice'::text, 'hearing'::text, 'closed'::text])),
  CONSTRAINT valid_client_matter_status CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS client_matters_business_lead_unique
  ON public.client_matters (business_id, lead_id);

CREATE UNIQUE INDEX IF NOT EXISTS client_matters_business_number_unique
  ON public.client_matters (business_id, matter_number);

CREATE INDEX IF NOT EXISTS idx_business_leads_business_status
  ON public.business_leads (business_id, status, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_leads_business_submitted
  ON public.business_leads (business_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_matters_business_status
  ON public.client_matters (business_id, status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_matters_business_stage
  ON public.client_matters (business_id, stage, last_activity_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_business_leads_updated_at ON public.business_leads;
CREATE TRIGGER update_business_leads_updated_at
  BEFORE UPDATE ON public.business_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_matters_updated_at ON public.client_matters;
CREATE TRIGGER update_client_matters_updated_at
  BEFORE UPDATE ON public.client_matters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.business_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_matters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business members can view leads" ON public.business_leads;
CREATE POLICY "Business members can view leads"
  ON public.business_leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_leads.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Business members can create leads" ON public.business_leads;
CREATE POLICY "Business members can create leads"
  ON public.business_leads
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_leads.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])
    )
  );

DROP POLICY IF EXISTS "Business members can update leads" ON public.business_leads;
CREATE POLICY "Business members can update leads"
  ON public.business_leads
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_leads.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_leads.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])
    )
  );

DROP POLICY IF EXISTS "Business members can delete leads" ON public.business_leads;
CREATE POLICY "Business members can delete leads"
  ON public.business_leads
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_leads.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Service role can manage business leads" ON public.business_leads;
CREATE POLICY "Service role can manage business leads"
  ON public.business_leads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Business members can view client matters" ON public.client_matters;
CREATE POLICY "Business members can view client matters"
  ON public.client_matters
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = client_matters.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Business members can create client matters" ON public.client_matters;
CREATE POLICY "Business members can create client matters"
  ON public.client_matters
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = client_matters.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])
    )
  );

DROP POLICY IF EXISTS "Business members can update client matters" ON public.client_matters;
CREATE POLICY "Business members can update client matters"
  ON public.client_matters
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = client_matters.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = client_matters.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])
    )
  );

DROP POLICY IF EXISTS "Business members can delete client matters" ON public.client_matters;
CREATE POLICY "Business members can delete client matters"
  ON public.client_matters
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = client_matters.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Service role can manage client matters" ON public.client_matters;
CREATE POLICY "Service role can manage client matters"
  ON public.client_matters
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
