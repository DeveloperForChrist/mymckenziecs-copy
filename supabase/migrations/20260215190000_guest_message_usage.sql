-- Guest message usage tracking (cookie-based), used to enforce guest limits server-side.
-- Guests are not linked to auth.users, so we track them separately.

CREATE TABLE IF NOT EXISTS public.guest_message_usage (
  guest_id UUID PRIMARY KEY,
  message_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.guest_message_usage ENABLE ROW LEVEL SECURITY;

-- Allow only service_role to read/write guest usage.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'guest_message_usage'
      AND policyname = 'guest_message_usage_service_role_all'
  ) THEN
    CREATE POLICY guest_message_usage_service_role_all
      ON public.guest_message_usage
      FOR ALL
      TO public
      USING (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role')
      WITH CHECK (coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role');
  END IF;
END
$$;

-- Keep updated_at fresh on write.
CREATE OR REPLACE FUNCTION public.touch_guest_message_usage_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_message_usage_touch_updated_at ON public.guest_message_usage;
CREATE TRIGGER trg_guest_message_usage_touch_updated_at
BEFORE UPDATE ON public.guest_message_usage
FOR EACH ROW
EXECUTE FUNCTION public.touch_guest_message_usage_updated_at();

-- Atomic, server-side consumption of guest messages to enforce limits without race conditions.
-- Returns one row with whether the message was allowed and when the user can message again.
CREATE OR REPLACE FUNCTION public.consume_guest_message(
  p_guest_id UUID,
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
AS $$
DECLARE
  now_ts TIMESTAMPTZ := NOW();
  window_interval INTERVAL := make_interval(secs => (p_window_ms / 1000));
  row_rec public.guest_message_usage%ROWTYPE;
BEGIN
  IF p_guest_id IS NULL OR p_limit IS NULL OR p_limit < 0 OR p_window_ms IS NULL OR p_window_ms <= 0 THEN
    RAISE EXCEPTION 'Invalid parameters';
  END IF;

  -- Ensure row exists.
  INSERT INTO public.guest_message_usage (guest_id, message_count, window_start)
  VALUES (p_guest_id, 0, now_ts)
  ON CONFLICT (guest_id) DO NOTHING;

  -- Lock row to make this operation atomic.
  SELECT *
  INTO row_rec
  FROM public.guest_message_usage
  WHERE guest_id = p_guest_id
  FOR UPDATE;

  -- Reset window if expired.
  IF row_rec.window_start IS NULL OR (now_ts - row_rec.window_start) >= window_interval THEN
    row_rec.window_start := now_ts;
    row_rec.message_count := 0;
  END IF;

  IF row_rec.message_count >= p_limit THEN
    allowed := FALSE;
    message_count := row_rec.message_count;
    window_start := row_rec.window_start;
    can_message_again_at := row_rec.window_start + window_interval;
    RETURN NEXT;
    RETURN;
  END IF;

  row_rec.message_count := row_rec.message_count + 1;

  UPDATE public.guest_message_usage
  SET
    message_count = row_rec.message_count,
    window_start = row_rec.window_start,
    updated_at = now_ts
  WHERE guest_id = p_guest_id;

  allowed := TRUE;
  message_count := row_rec.message_count;
  window_start := row_rec.window_start;
  can_message_again_at := NULL;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_guest_message(UUID, INTEGER, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_guest_message(UUID, INTEGER, BIGINT) TO service_role;

