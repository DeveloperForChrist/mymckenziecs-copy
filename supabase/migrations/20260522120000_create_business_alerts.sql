-- Business alerts feed (real notifications for business dashboard)
CREATE TABLE IF NOT EXISTS public.business_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system',
  priority TEXT NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  client_name TEXT,
  action_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS business_alerts_business_created_idx
  ON public.business_alerts (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS business_alerts_business_read_idx
  ON public.business_alerts (business_id, is_read, created_at DESC);

ALTER TABLE public.business_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business members view alerts" ON public.business_alerts;
CREATE POLICY "Business members view alerts"
  ON public.business_alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_alerts.business_id
        AND b.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_alerts.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Business members update alerts" ON public.business_alerts;
CREATE POLICY "Business members update alerts"
  ON public.business_alerts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_alerts.business_id
        AND b.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_alerts.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Business members dismiss alerts" ON public.business_alerts;
CREATE POLICY "Business members dismiss alerts"
  ON public.business_alerts
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.businesses b
      WHERE b.id = business_alerts.business_id
        AND b.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_alerts.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Service role manages alerts" ON public.business_alerts;
CREATE POLICY "Service role manages alerts"
  ON public.business_alerts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
