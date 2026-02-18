-- Expand allowed subscription plan_type values to match current app plans.

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS valid_plan_type;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT valid_plan_type
  CHECK (
    plan_type = ANY (
      ARRAY[
        'free'::text,
        'standard'::text,
        'essential'::text,
        'premium'::text,
        'plus'::text,
        'premium pro'::text,
        'premium_pro'::text,
        'premium cheap'::text
      ]
    )
  );
