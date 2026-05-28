-- Fix ambiguous window_start references in anonymous IP-scoped usage function.

CREATE OR REPLACE FUNCTION public.consume_guest_message_scoped(
  p_guest_id UUID,
  p_ip_usage_id UUID,
  p_limit INTEGER,
  p_window_ms BIGINT
)
RETURNS TABLE(
  allowed BOOLEAN,
  message_count INTEGER,
  window_start TIMESTAMPTZ,
  can_message_again_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  now_ts TIMESTAMPTZ := NOW();
  window_interval INTERVAL := make_interval(secs => (p_window_ms / 1000));
  usage_ids UUID[];
  row_rec public.guest_message_usage%ROWTYPE;
  highest_count INTEGER := 0;
  earliest_window TIMESTAMPTZ := NULL;
  blocked_until TIMESTAMPTZ := NULL;
BEGIN
  IF p_limit IS NULL OR p_limit < 0 OR p_window_ms IS NULL OR p_window_ms <= 0 THEN
    RAISE EXCEPTION 'Invalid parameters';
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT usage_id
    FROM unnest(ARRAY[p_guest_id, p_ip_usage_id]) AS usage_id
    WHERE usage_id IS NOT NULL
    ORDER BY usage_id
  )
  INTO usage_ids;

  IF usage_ids IS NULL OR array_length(usage_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one usage id is required';
  END IF;

  INSERT INTO public.guest_message_usage (guest_id, message_count, window_start)
  SELECT usage_id, 0, now_ts
  FROM unnest(usage_ids) AS usage_id
  ON CONFLICT (guest_id) DO NOTHING;

  FOR row_rec IN
    SELECT *
    FROM public.guest_message_usage
    WHERE guest_id = ANY(usage_ids)
    ORDER BY guest_id
    FOR UPDATE
  LOOP
    IF row_rec.window_start IS NULL OR (now_ts - row_rec.window_start) >= window_interval THEN
      row_rec.window_start := now_ts;
      row_rec.message_count := 0;
    END IF;

    highest_count := GREATEST(highest_count, row_rec.message_count);
    earliest_window := CASE
      WHEN earliest_window IS NULL THEN row_rec.window_start
      ELSE LEAST(earliest_window, row_rec.window_start)
    END;

    IF row_rec.message_count >= p_limit THEN
      blocked_until := CASE
        WHEN blocked_until IS NULL THEN row_rec.window_start + window_interval
        ELSE GREATEST(blocked_until, row_rec.window_start + window_interval)
      END;
    END IF;
  END LOOP;

  IF blocked_until IS NOT NULL THEN
    allowed := FALSE;
    message_count := highest_count;
    window_start := earliest_window;
    can_message_again_at := blocked_until;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.guest_message_usage AS usage
  SET
    message_count = CASE
      WHEN usage.window_start IS NULL OR (now_ts - usage.window_start) >= window_interval THEN 1
      ELSE usage.message_count + 1
    END,
    window_start = CASE
      WHEN usage.window_start IS NULL OR (now_ts - usage.window_start) >= window_interval THEN now_ts
      ELSE usage.window_start
    END,
    updated_at = now_ts
  WHERE usage.guest_id = ANY(usage_ids);

  allowed := TRUE;
  message_count := highest_count + 1;
  window_start := earliest_window;
  can_message_again_at := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_guest_message_scoped(UUID, UUID, INTEGER, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_guest_message_scoped(UUID, UUID, INTEGER, BIGINT) TO service_role;
