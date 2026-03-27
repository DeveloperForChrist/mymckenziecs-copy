ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS valid_subscription_status;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT valid_subscription_status
  CHECK (status IN ('active', 'trialing', 'cancelled', 'expired', 'past_due'));
