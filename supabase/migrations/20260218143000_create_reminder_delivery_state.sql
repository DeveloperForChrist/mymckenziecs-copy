CREATE TABLE IF NOT EXISTS public.reminder_delivery_state (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  run_date DATE NOT NULL,
  lookahead_days INTEGER NOT NULL CHECK (lookahead_days BETWEEN 1 AND 30),
  status TEXT NOT NULL CHECK (status IN ('processing', 'sent', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_bucket INTEGER,
  first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, run_date, lookahead_days)
);

CREATE INDEX IF NOT EXISTS idx_reminder_delivery_state_status
  ON public.reminder_delivery_state (run_date, lookahead_days, status, last_attempt_bucket);

CREATE OR REPLACE FUNCTION public.claim_reminder_delivery(
  p_user_id UUID,
  p_run_date DATE,
  p_lookahead_days INTEGER,
  p_bucket_index INTEGER,
  p_max_attempts INTEGER DEFAULT 3
)
RETURNS TABLE (
  should_send BOOLEAN,
  reason TEXT,
  attempt_count INTEGER,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.reminder_delivery_state%ROWTYPE;
BEGIN
  SELECT *
  INTO rec
  FROM public.reminder_delivery_state
  WHERE user_id = p_user_id
    AND run_date = p_run_date
    AND lookahead_days = p_lookahead_days
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.reminder_delivery_state (
      user_id,
      run_date,
      lookahead_days,
      status,
      attempt_count,
      last_attempt_bucket,
      first_attempt_at,
      last_attempt_at,
      updated_at
    ) VALUES (
      p_user_id,
      p_run_date,
      p_lookahead_days,
      'processing',
      1,
      p_bucket_index,
      NOW(),
      NOW(),
      NOW()
    )
    RETURNING * INTO rec;

    RETURN QUERY SELECT TRUE, 'new', rec.attempt_count, rec.status;
    RETURN;
  END IF;

  IF rec.status = 'sent' THEN
    RETURN QUERY SELECT FALSE, 'already_sent', rec.attempt_count, rec.status;
    RETURN;
  END IF;

  IF rec.attempt_count >= p_max_attempts THEN
    RETURN QUERY SELECT FALSE, 'max_attempts', rec.attempt_count, rec.status;
    RETURN;
  END IF;

  IF rec.status = 'failed' AND COALESCE(rec.last_attempt_bucket, -1) >= p_bucket_index THEN
    RETURN QUERY SELECT FALSE, 'await_next_bucket', rec.attempt_count, rec.status;
    RETURN;
  END IF;

  IF rec.status = 'processing' AND rec.last_attempt_at > NOW() - INTERVAL '30 minutes' THEN
    RETURN QUERY SELECT FALSE, 'in_progress_recent', rec.attempt_count, rec.status;
    RETURN;
  END IF;

  UPDATE public.reminder_delivery_state
  SET
    status = 'processing',
    attempt_count = rec.attempt_count + 1,
    last_attempt_bucket = p_bucket_index,
    last_attempt_at = NOW(),
    last_error = NULL,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND run_date = p_run_date
    AND lookahead_days = p_lookahead_days
  RETURNING * INTO rec;

  RETURN QUERY SELECT TRUE, 'retry', rec.attempt_count, rec.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_reminder_delivery(
  p_user_id UUID,
  p_run_date DATE,
  p_lookahead_days INTEGER,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.reminder_delivery_state
  SET
    status = CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
    sent_at = CASE WHEN p_success THEN NOW() ELSE sent_at END,
    last_error = CASE WHEN p_success THEN NULL ELSE LEFT(COALESCE(p_error, 'unknown error'), 2000) END,
    last_attempt_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND run_date = p_run_date
    AND lookahead_days = p_lookahead_days;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_reminder_delivery(UUID, DATE, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_reminder_delivery(UUID, DATE, INTEGER, BOOLEAN, TEXT) TO service_role;
