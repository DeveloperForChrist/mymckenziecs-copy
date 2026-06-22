-- Keep marketplace enquiry PII private until one business atomically claims it.

CREATE TABLE IF NOT EXISTS public.marketplace_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  date_of_birth DATE,
  location TEXT NOT NULL DEFAULT '',
  issue_type TEXT NOT NULL DEFAULT 'General Enquiry',
  urgency TEXT NOT NULL DEFAULT 'medium',
  full_details TEXT NOT NULL,
  trace_id TEXT,
  source_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  claimed_lead_id UUID REFERENCES public.business_leads(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_marketplace_enquiry_status
    CHECK (status = ANY (ARRAY['open'::text, 'claimed'::text, 'withdrawn'::text])),
  CONSTRAINT valid_marketplace_enquiry_urgency
    CHECK (urgency = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))
);

ALTER TABLE public.business_leads
  ADD COLUMN IF NOT EXISTS marketplace_enquiry_id UUID
    REFERENCES public.marketplace_enquiries(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS business_leads_marketplace_offer_unique
  ON public.business_leads (business_id, marketplace_enquiry_id)
  WHERE marketplace_enquiry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS marketplace_enquiries_status_created_idx
  ON public.marketplace_enquiries (status, created_at DESC);

ALTER TABLE public.marketplace_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_enquiries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages marketplace enquiries" ON public.marketplace_enquiries;
CREATE POLICY "Service role manages marketplace enquiries"
  ON public.marketplace_enquiries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON TABLE public.marketplace_enquiries FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.marketplace_enquiries TO service_role;

CREATE OR REPLACE FUNCTION public.submit_marketplace_enquiry(
  p_client_name TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_date_of_birth DATE,
  p_full_details TEXT,
  p_trace_id TEXT DEFAULT NULL,
  p_location TEXT DEFAULT '',
  p_issue_type TEXT DEFAULT 'General Enquiry',
  p_urgency TEXT DEFAULT 'medium'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_enquiry_id UUID;
  v_lead_count INTEGER;
BEGIN
  IF NULLIF(BTRIM(p_client_name), '') IS NULL
     OR NULLIF(BTRIM(p_email), '') IS NULL
     OR NULLIF(BTRIM(p_phone), '') IS NULL
     OR NULLIF(BTRIM(p_full_details), '') IS NULL THEN
    RAISE EXCEPTION 'Required marketplace enquiry fields are missing';
  END IF;

  INSERT INTO public.marketplace_enquiries (
    client_name, email, phone, date_of_birth, location, issue_type,
    urgency, full_details, trace_id
  ) VALUES (
    LEFT(BTRIM(p_client_name), 180), LEFT(LOWER(BTRIM(p_email)), 240),
    LEFT(BTRIM(p_phone), 80), p_date_of_birth, LEFT(BTRIM(COALESCE(p_location, '')), 180),
    LEFT(BTRIM(COALESCE(p_issue_type, 'General Enquiry')), 180),
    CASE WHEN p_urgency = ANY (ARRAY['high', 'medium', 'low']) THEN p_urgency ELSE 'medium' END,
    LEFT(BTRIM(p_full_details), 8000), NULLIF(LEFT(BTRIM(COALESCE(p_trace_id, '')), 180), '')
  )
  RETURNING id INTO v_enquiry_id;

  INSERT INTO public.business_leads (
    business_id, name, email, phone, location, issue_type, urgency,
    summary, full_details, documents, tags, status, source, submitted_at,
    marketplace_enquiry_id
  )
  SELECT
    b.id, 'Private marketplace enquiry', '', '', '', 'General Enquiry', 'medium',
    'A new general legal support enquiry is available. Accept it to reveal the client details.',
    'Client identity, contact information and case details are private until this enquiry is accepted.',
    ARRAY[]::TEXT[], ARRAY['Marketplace', 'Private until accepted']::TEXT[],
    'new', 'portal', NOW(), v_enquiry_id
  FROM public.businesses b
  WHERE b.status = 'active';

  GET DIAGNOSTICS v_lead_count = ROW_COUNT;
  IF v_lead_count = 0 THEN
    RAISE EXCEPTION 'No active professionals are available';
  END IF;

  INSERT INTO public.business_alerts (
    business_id, type, priority, title, body, action_label, metadata
  )
  SELECT
    l.business_id, 'lead', 'medium', 'New marketplace enquiry',
    'A private general enquiry is available. Accept it from Leads & Enquiries to reveal the client details.',
    'Review enquiry',
    jsonb_build_object('marketplaceEnquiryId', v_enquiry_id, 'leadId', l.id)
  FROM public.business_leads l
  WHERE l.marketplace_enquiry_id = v_enquiry_id;

  RETURN jsonb_build_object('enquiryId', v_enquiry_id, 'leadCount', v_lead_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_marketplace_enquiry(
  p_lead_id UUID,
  p_business_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_lead public.business_leads%ROWTYPE;
  v_enquiry public.marketplace_enquiries%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_members bm
    WHERE bm.business_id = p_business_id
      AND bm.user_id = p_user_id
      AND bm.status = 'active'
      AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])
  ) AND NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = p_business_id AND b.owner_user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Business membership required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead
  FROM public.business_leads
  WHERE id = p_lead_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND OR v_lead.marketplace_enquiry_id IS NULL THEN
    RAISE EXCEPTION 'Marketplace offer not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_enquiry
  FROM public.marketplace_enquiries
  WHERE id = v_lead.marketplace_enquiry_id
  FOR UPDATE;

  IF v_enquiry.status = 'claimed' AND v_enquiry.claimed_business_id <> p_business_id THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_claimed');
  END IF;

  IF v_enquiry.status <> 'open'
     AND NOT (v_enquiry.status = 'claimed' AND v_enquiry.claimed_business_id = p_business_id) THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'unavailable');
  END IF;

  UPDATE public.marketplace_enquiries
  SET status = 'claimed', claimed_business_id = p_business_id,
      claimed_lead_id = p_lead_id, claimed_at = COALESCE(claimed_at, NOW()), updated_at = NOW()
  WHERE id = v_enquiry.id;

  UPDATE public.business_leads
  SET name = v_enquiry.client_name, email = v_enquiry.email, phone = v_enquiry.phone,
      location = v_enquiry.location, issue_type = v_enquiry.issue_type,
      urgency = v_enquiry.urgency,
      summary = LEFT(v_enquiry.full_details, 1200),
      full_details = CONCAT_WS(E'\n\n',
        CASE WHEN v_enquiry.trace_id IS NOT NULL THEN 'Trace ID: ' || v_enquiry.trace_id END,
        CASE WHEN v_enquiry.date_of_birth IS NOT NULL THEN 'Date of Birth: ' || v_enquiry.date_of_birth::TEXT END,
        v_enquiry.full_details
      ),
      tags = ARRAY['Marketplace', 'Accepted']::TEXT[], status = 'accepted',
      accepted_at = COALESCE(accepted_at, NOW()), declined_at = NULL
  WHERE id = p_lead_id
  RETURNING * INTO v_lead;

  UPDATE public.business_leads
  SET name = 'Marketplace enquiry unavailable', email = '', phone = '', location = '',
      summary = 'This marketplace enquiry has been accepted by another professional.',
      full_details = 'No client details are available for this enquiry.',
      tags = ARRAY['Marketplace', 'Unavailable']::TEXT[], status = 'declined',
      accepted_at = NULL, declined_at = COALESCE(declined_at, NOW())
  WHERE marketplace_enquiry_id = v_enquiry.id AND id <> p_lead_id;

  UPDATE public.client_matters cm
  SET status = 'archived', last_activity_at = NOW()
  FROM public.business_leads l
  WHERE cm.lead_id = l.id
    AND l.marketplace_enquiry_id = v_enquiry.id
    AND l.id <> p_lead_id;

  UPDATE public.business_alerts
  SET dismissed_at = NOW(), is_read = TRUE
  WHERE metadata ->> 'marketplaceEnquiryId' = v_enquiry.id::TEXT
    AND business_id <> p_business_id;

  UPDATE public.business_alerts
  SET title = 'Marketplace enquiry accepted',
      body = 'You accepted this enquiry. The client details are now available in Leads & Enquiries.',
      is_read = TRUE
  WHERE metadata ->> 'marketplaceEnquiryId' = v_enquiry.id::TEXT
    AND business_id = p_business_id;

  RETURN jsonb_build_object('claimed', true, 'lead', to_jsonb(v_lead));
END;
$$;

REVOKE ALL ON FUNCTION public.submit_marketplace_enquiry(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_marketplace_enquiry(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_marketplace_enquiry(TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_enquiry(UUID, UUID, UUID) TO service_role;

-- Consolidate historic general contact-form copies and scrub every non-winning copy.
WITH legacy AS (
  SELECT l.*,
    COALESCE(
      (SELECT SUBSTRING(tag FROM 7) FROM UNNEST(l.tags) tag WHERE tag LIKE 'trace:%' LIMIT 1),
      MD5(LOWER(l.email) || '|' || l.phone || '|' || l.submitted_at::TEXT || '|' || l.summary)
    ) AS legacy_key
  FROM public.business_leads l
  WHERE l.marketplace_enquiry_id IS NULL AND l.tags @> ARRAY['Contact Form']::TEXT[]
), representative AS (
  SELECT DISTINCT ON (legacy_key) * FROM legacy ORDER BY legacy_key, submitted_at, id
)
INSERT INTO public.marketplace_enquiries (
  client_name, email, phone, date_of_birth, location, issue_type, urgency,
  full_details, trace_id, source_key, created_at
)
SELECT name, email, phone,
  CASE WHEN full_details ~ 'Date of Birth: [0-9]{4}-[0-9]{2}-[0-9]{2}'
    THEN SUBSTRING(full_details FROM 'Date of Birth: ([0-9]{4}-[0-9]{2}-[0-9]{2})')::DATE END,
  location, issue_type, urgency, full_details,
  (SELECT SUBSTRING(tag FROM 7) FROM UNNEST(tags) tag WHERE tag LIKE 'trace:%' LIMIT 1),
  'legacy:' || legacy_key, submitted_at
FROM representative
ON CONFLICT (source_key) DO NOTHING;

WITH keyed AS (
  SELECT l.id,
    COALESCE(
      (SELECT SUBSTRING(tag FROM 7) FROM UNNEST(l.tags) tag WHERE tag LIKE 'trace:%' LIMIT 1),
      MD5(LOWER(l.email) || '|' || l.phone || '|' || l.submitted_at::TEXT || '|' || l.summary)
    ) AS legacy_key
  FROM public.business_leads l
  WHERE l.marketplace_enquiry_id IS NULL AND l.tags @> ARRAY['Contact Form']::TEXT[]
)
UPDATE public.business_leads l
SET marketplace_enquiry_id = e.id
FROM keyed k
JOIN public.marketplace_enquiries e ON e.source_key = 'legacy:' || k.legacy_key
WHERE l.id = k.id;

WITH winners AS (
  SELECT DISTINCT ON (marketplace_enquiry_id)
    marketplace_enquiry_id, id AS lead_id, business_id, accepted_at
  FROM public.business_leads
  WHERE marketplace_enquiry_id IS NOT NULL AND status = 'accepted'
  ORDER BY marketplace_enquiry_id, accepted_at NULLS LAST, submitted_at, id
)
UPDATE public.marketplace_enquiries e
SET status = 'claimed', claimed_business_id = w.business_id,
    claimed_lead_id = w.lead_id, claimed_at = COALESCE(w.accepted_at, NOW()), updated_at = NOW()
FROM winners w
WHERE e.id = w.marketplace_enquiry_id;

UPDATE public.business_leads l
SET name = CASE WHEN e.claimed_lead_id IS NULL THEN 'Private marketplace enquiry' ELSE 'Marketplace enquiry unavailable' END,
    email = '', phone = '', location = '',
    summary = CASE WHEN e.claimed_lead_id IS NULL
      THEN 'A new general legal support enquiry is available. Accept it to reveal the client details.'
      ELSE 'This marketplace enquiry has been accepted by another professional.' END,
    full_details = CASE WHEN e.claimed_lead_id IS NULL
      THEN 'Client identity, contact information and case details are private until this enquiry is accepted.'
      ELSE 'No client details are available for this enquiry.' END,
    tags = CASE WHEN e.claimed_lead_id IS NULL
      THEN ARRAY['Marketplace', 'Private until accepted']::TEXT[]
      ELSE ARRAY['Marketplace', 'Unavailable']::TEXT[] END,
    status = CASE WHEN e.claimed_lead_id IS NULL THEN 'new' ELSE 'declined' END,
    accepted_at = NULL,
    declined_at = CASE WHEN e.claimed_lead_id IS NULL THEN NULL ELSE COALESCE(l.declined_at, NOW()) END
FROM public.marketplace_enquiries e
WHERE l.marketplace_enquiry_id = e.id
  AND l.id IS DISTINCT FROM e.claimed_lead_id;

UPDATE public.client_matters cm
SET status = 'archived', last_activity_at = NOW()
FROM public.business_leads l
JOIN public.marketplace_enquiries e ON e.id = l.marketplace_enquiry_id
WHERE cm.lead_id = l.id AND l.id IS DISTINCT FROM e.claimed_lead_id;

INSERT INTO public.business_alerts (
  business_id, type, priority, title, body, action_label, metadata
)
SELECT l.business_id, 'lead', 'medium', 'Marketplace enquiry available',
  'A private general enquiry is available. Accept it from Leads & Enquiries to reveal the client details.',
  'Review enquiry', jsonb_build_object('marketplaceEnquiryId', l.marketplace_enquiry_id, 'leadId', l.id)
FROM public.business_leads l
JOIN public.marketplace_enquiries e ON e.id = l.marketplace_enquiry_id AND e.status = 'open'
WHERE l.status = 'new'
  AND NOT EXISTS (
    SELECT 1 FROM public.business_alerts a
    WHERE a.business_id = l.business_id
      AND a.metadata ->> 'marketplaceEnquiryId' = l.marketplace_enquiry_id::TEXT
  );
