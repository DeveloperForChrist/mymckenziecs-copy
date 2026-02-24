-- Remove Standard plan tier from subscriptions and normalize legacy labels.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS valid_plan_type;

UPDATE public.subscriptions
SET plan_type = CASE
  WHEN lower(trim(plan_type)) IN ('standard', 'essential', 'premium') THEN 'Essential'
  WHEN lower(trim(plan_type)) IN ('plus', 'premium pro', 'premium_pro') THEN 'Plus'
  WHEN lower(trim(plan_type)) IN ('premium cheap') THEN 'Premium Cheap'
  WHEN lower(trim(plan_type)) IN ('free') THEN 'Free'
  ELSE plan_type
END;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT valid_plan_type
  CHECK (
    plan_type = ANY (
      ARRAY[
        'Free'::text,
        'Essential'::text,
        'Premium Cheap'::text,
        'Plus'::text
      ]
    )
  );
