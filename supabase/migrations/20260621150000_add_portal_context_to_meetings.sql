BEGIN;

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS matter_id UUID REFERENCES public.client_matters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL;

UPDATE public.meetings AS meetings
SET
  business_id = businesses.id,
  client_name = COALESCE(meetings.client_name, clients.name),
  client_email = COALESCE(NULLIF(lower(trim(meetings.client_email)), ''), NULLIF(lower(trim(clients.email)), ''))
FROM public.clients AS clients,
     public.businesses AS businesses
WHERE meetings.client_id = clients.id
  AND businesses.owner_user_id = meetings.user_id
  AND (
    meetings.business_id IS NULL
    OR meetings.client_name IS NULL
    OR meetings.client_email IS NULL
  );

CREATE INDEX IF NOT EXISTS idx_meetings_business_date
  ON public.meetings (business_id, meeting_date, meeting_time)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_client_email_date
  ON public.meetings (client_email, meeting_date, meeting_time)
  WHERE client_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_meetings_case_date
  ON public.meetings (case_id, meeting_date)
  WHERE case_id IS NOT NULL;

COMMIT;
