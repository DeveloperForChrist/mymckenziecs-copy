-- Ensure one reminder delivery state per user per run_date (daily digest dedupe),
-- regardless of lookahead window changes.

WITH ranked AS (
  SELECT
    ctid,
    user_id,
    run_date,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, run_date
      ORDER BY
        CASE status
          WHEN 'sent' THEN 0
          WHEN 'processing' THEN 1
          ELSE 2
        END,
        COALESCE(sent_at, last_attempt_at, first_attempt_at) DESC,
        lookahead_days DESC
    ) AS rn
  FROM public.reminder_delivery_state
)
DELETE FROM public.reminder_delivery_state t
USING ranked r
WHERE t.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_reminder_delivery_state_user_run_date
  ON public.reminder_delivery_state (user_id, run_date);

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

  -- Guardrail against duplicate sends when a prior run already claimed this row
  -- but completion status update was delayed/interrupted.
  IF rec.status = 'processing' THEN
    RETURN QUERY SELECT FALSE, 'processing_locked', rec.attempt_count, rec.status;
    RETURN;
  END IF;

  UPDATE public.reminder_delivery_state
  SET
    status = 'processing',
    attempt_count = rec.attempt_count + 1,
    lookahead_days = GREATEST(rec.lookahead_days, p_lookahead_days),
    last_attempt_bucket = p_bucket_index,
    last_attempt_at = NOW(),
    last_error = NULL,
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND run_date = p_run_date
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
    lookahead_days = GREATEST(lookahead_days, p_lookahead_days),
    sent_at = CASE WHEN p_success THEN NOW() ELSE sent_at END,
    last_error = CASE WHEN p_success THEN NULL ELSE LEFT(COALESCE(p_error, 'unknown error'), 2000) END,
    last_attempt_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id
    AND run_date = p_run_date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_reminder_delivery(UUID, DATE, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_reminder_delivery(UUID, DATE, INTEGER, BOOLEAN, TEXT) TO service_role;
