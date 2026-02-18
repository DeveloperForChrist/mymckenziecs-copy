ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS valid_plan_type;

-- Normalize subscription plan labels to canonical UI names.
-- Canonical labels used by app/pricing:
--   Free, Standard, Essential, Premium Cheap, Plus
UPDATE public.subscriptions
SET plan_type = CASE
  WHEN lower(plan_type) IN ('standard') THEN 'Standard'
  WHEN lower(plan_type) IN ('essential', 'premium') THEN 'Essential'
  WHEN lower(plan_type) IN ('plus', 'premium pro', 'premium_pro') THEN 'Plus'
  WHEN lower(plan_type) IN ('premium cheap') THEN 'Premium Cheap'
  WHEN lower(plan_type) IN ('free') THEN 'Free'
  ELSE plan_type
END;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT valid_plan_type
  CHECK (
    plan_type = ANY (
      ARRAY[
        'Free'::text,
        'Standard'::text,
        'Essential'::text,
        'Premium Cheap'::text,
        'Plus'::text
      ]
    )
  );
