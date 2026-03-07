ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_plan_type TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_change_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_change
  ON public.subscriptions (scheduled_change_at DESC)
  WHERE scheduled_plan_type IS NOT NULL;
