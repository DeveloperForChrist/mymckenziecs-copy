CREATE TABLE IF NOT EXISTS public.daily_feature_usage (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  usage_date DATE NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, feature_key, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_feature_usage_feature_date
  ON public.daily_feature_usage (feature_key, usage_date DESC);

ALTER TABLE public.daily_feature_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_feature_usage_service_role_all ON public.daily_feature_usage;
CREATE POLICY daily_feature_usage_service_role_all
  ON public.daily_feature_usage
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.consume_daily_feature_quota(
  p_user_id UUID,
  p_feature_key TEXT,
  p_limit INTEGER,
  p_timezone TEXT DEFAULT 'Europe/London'
)
RETURNS TABLE(
  allowed BOOLEAN,
  used INTEGER,
  remaining INTEGER,
  usage_date DATE,
  resets_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  now_ts TIMESTAMPTZ := NOW();
  quota_date DATE;
  quota_resets_at TIMESTAMPTZ;
  row_rec public.daily_feature_usage%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_feature_key IS NULL OR btrim(p_feature_key) = '' THEN
    RAISE EXCEPTION 'Invalid daily quota parameters';
  END IF;

  IF p_limit IS NULL OR p_limit < 0 THEN
    RAISE EXCEPTION 'Invalid daily quota limit';
  END IF;

  quota_date := (now_ts AT TIME ZONE COALESCE(NULLIF(btrim(p_timezone), ''), 'Europe/London'))::DATE;
  quota_resets_at := ((quota_date + 1)::TIMESTAMP AT TIME ZONE COALESCE(NULLIF(btrim(p_timezone), ''), 'Europe/London'));

  INSERT INTO public.daily_feature_usage (
    user_id,
    feature_key,
    usage_date,
    usage_count
  )
  VALUES (
    p_user_id,
    btrim(p_feature_key),
    quota_date,
    0
  )
  ON CONFLICT (user_id, feature_key, usage_date) DO NOTHING;

  SELECT *
  INTO row_rec
  FROM public.daily_feature_usage
  WHERE user_id = p_user_id
    AND feature_key = btrim(p_feature_key)
    AND usage_date = quota_date
  FOR UPDATE;

  IF row_rec.usage_count >= p_limit THEN
    allowed := FALSE;
    used := row_rec.usage_count;
    remaining := 0;
    usage_date := quota_date;
    resets_at := quota_resets_at;
    RETURN NEXT;
    RETURN;
  END IF;

  row_rec.usage_count := row_rec.usage_count + 1;

  UPDATE public.daily_feature_usage
  SET
    usage_count = row_rec.usage_count,
    updated_at = now_ts
  WHERE user_id = p_user_id
    AND feature_key = btrim(p_feature_key)
    AND usage_date = quota_date;

  allowed := TRUE;
  used := row_rec.usage_count;
  remaining := GREATEST(p_limit - row_rec.usage_count, 0);
  usage_date := quota_date;
  resets_at := quota_resets_at;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_daily_feature_quota(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_daily_feature_quota(UUID, TEXT, INTEGER, TEXT) TO service_role;

ALTER FUNCTION public.consume_daily_feature_quota(UUID, TEXT, INTEGER, TEXT)
  SET search_path = public;
