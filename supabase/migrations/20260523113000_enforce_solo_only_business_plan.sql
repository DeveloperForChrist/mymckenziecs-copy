-- Enforce Solo-only business plan model.

-- Normalize existing business plan values.
UPDATE public.businesses
SET plan_type = 'Solo'
WHERE plan_type <> 'Solo';

UPDATE public.user_entitlements
SET plan_type = 'Solo'
WHERE billing_audience = 'business'
  AND plan_family = 'business'
  AND plan_type <> 'Solo';

UPDATE public.subscriptions
SET plan_type = 'Solo'
WHERE billing_audience = 'business'
  AND plan_family = 'business'
  AND plan_type <> 'Solo';

-- Businesses table constraint.
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS valid_business_plan_type;

ALTER TABLE public.businesses
  ADD CONSTRAINT valid_business_plan_type
    CHECK (plan_type = 'Solo');

-- Subscriptions plan/audience constraint.
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS valid_plan_by_audience;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT valid_plan_by_audience
    CHECK (
      (
        billing_audience = 'litigant'
        AND plan_family = 'litigant'
        AND plan_type = ANY (ARRAY['Basic'::text, 'Premium'::text, 'Premium +'::text])
      )
      OR
      (
        billing_audience = 'business'
        AND plan_family = 'business'
        AND plan_type = 'Solo'
      )
    );

-- User entitlements plan/audience constraint.
ALTER TABLE public.user_entitlements
  DROP CONSTRAINT IF EXISTS valid_user_entitlements_plan_by_audience;

ALTER TABLE public.user_entitlements
  ADD CONSTRAINT valid_user_entitlements_plan_by_audience
    CHECK (
      (
        billing_audience = 'litigant'
        AND plan_family = 'litigant'
        AND plan_type = ANY (ARRAY['No plan'::text, 'Basic'::text, 'Premium'::text, 'Premium +'::text])
        AND business_id IS NULL
      )
      OR
      (
        billing_audience = 'business'
        AND plan_family = 'business'
        AND plan_type = 'Solo'
        AND business_id IS NOT NULL
      )
    );
