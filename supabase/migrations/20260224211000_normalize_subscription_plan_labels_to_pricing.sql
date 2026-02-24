-- Normalize subscription plan labels to match pricing page labels.
-- Canonical labels:
--   Basic, Premium, Premium +

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS valid_plan_type;

UPDATE public.subscriptions
SET plan_type = CASE
  WHEN lower(trim(plan_type)) IN ('free') THEN 'Basic'
  WHEN lower(trim(plan_type)) IN ('basic', 'essential', 'premium cheap') THEN 'Basic'
  WHEN lower(trim(plan_type)) IN ('premium', 'standard') THEN 'Premium'
  WHEN lower(trim(plan_type)) IN ('premium +', 'premium plus', 'plus', 'premium pro', 'premium_pro') THEN 'Premium +'
  ELSE plan_type
END;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT valid_plan_type
  CHECK (
    plan_type = ANY (
      ARRAY[
        'Basic'::text,
        'Premium'::text,
        'Premium +'::text
      ]
    )
  );
