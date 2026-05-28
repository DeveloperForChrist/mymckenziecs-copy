CREATE TABLE IF NOT EXISTS public.monthly_feature_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  usage_month DATE NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, feature_key, usage_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_feature_usage_feature_month
  ON public.monthly_feature_usage (feature_key, usage_month DESC);

ALTER TABLE public.monthly_feature_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monthly_feature_usage_service_role_all ON public.monthly_feature_usage;
CREATE POLICY monthly_feature_usage_service_role_all
  ON public.monthly_feature_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_monthly_feature_quota(
  p_user_id UUID,
  p_feature_key TEXT,
  p_limit INTEGER,
  p_timezone TEXT DEFAULT 'Europe/London'
)
RETURNS TABLE(
  allowed BOOLEAN,
  used INTEGER,
  remaining INTEGER,
  usage_month DATE,
  resets_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  now_ts TIMESTAMPTZ := NOW();
  quota_month DATE;
  quota_resets_at TIMESTAMPTZ;
  row_rec public.monthly_feature_usage%ROWTYPE;
  timezone_name TEXT := COALESCE(NULLIF(btrim(p_timezone), ''), 'Europe/London');
BEGIN
  IF p_user_id IS NULL OR p_feature_key IS NULL OR btrim(p_feature_key) = '' THEN
    RAISE EXCEPTION 'Invalid monthly quota parameters';
  END IF;

  IF p_limit IS NULL OR p_limit < 0 THEN
    RAISE EXCEPTION 'Invalid monthly quota limit';
  END IF;

  quota_month := date_trunc('month', now_ts AT TIME ZONE timezone_name)::DATE;
  quota_resets_at := ((quota_month + INTERVAL '1 month')::TIMESTAMP AT TIME ZONE timezone_name);

  INSERT INTO public.monthly_feature_usage (
    user_id,
    feature_key,
    usage_month,
    usage_count
  )
  VALUES (
    p_user_id,
    btrim(p_feature_key),
    quota_month,
    0
  )
  ON CONFLICT (user_id, feature_key, usage_month) DO NOTHING;

  SELECT *
  INTO row_rec
  FROM public.monthly_feature_usage
  WHERE user_id = p_user_id
    AND feature_key = btrim(p_feature_key)
    AND usage_month = quota_month
  FOR UPDATE;

  IF row_rec.usage_count >= p_limit THEN
    allowed := FALSE;
    used := row_rec.usage_count;
    remaining := 0;
    usage_month := quota_month;
    resets_at := quota_resets_at;
    RETURN NEXT;
    RETURN;
  END IF;

  row_rec.usage_count := row_rec.usage_count + 1;

  UPDATE public.monthly_feature_usage
  SET
    usage_count = row_rec.usage_count,
    updated_at = now_ts
  WHERE user_id = p_user_id
    AND feature_key = btrim(p_feature_key)
    AND usage_month = quota_month;

  allowed := TRUE;
  used := row_rec.usage_count;
  remaining := GREATEST(p_limit - row_rec.usage_count, 0);
  usage_month := quota_month;
  resets_at := quota_resets_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_monthly_feature_quota(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_monthly_feature_quota(UUID, TEXT, INTEGER, TEXT) TO service_role;

ALTER FUNCTION public.consume_monthly_feature_quota(UUID, TEXT, INTEGER, TEXT)
  SET search_path = public;
