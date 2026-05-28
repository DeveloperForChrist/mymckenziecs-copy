-- Add standalone Assistant product plan labels without merging them into case workspace plans.

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS valid_plan_type,
  DROP CONSTRAINT IF EXISTS valid_subscription_plan_by_audience,
  DROP CONSTRAINT IF EXISTS valid_plan_by_audience;

ALTER TABLE subscriptions
  ADD CONSTRAINT valid_plan_by_audience CHECK (
    (
      billing_audience = 'litigant'
      AND plan_family = 'litigant'
      AND plan_type = ANY (ARRAY[
        'Basic'::text,
        'Premium'::text,
        'Premium +'::text,
        'Assistant Plus'::text,
        'Assistant Pro'::text
      ])
    )
    OR (
      billing_audience = 'business'
      AND plan_family = 'business'
      AND plan_type = 'Solo'::text
    )
  );

ALTER TABLE user_entitlements
  DROP CONSTRAINT IF EXISTS valid_entitlement_plan_type,
  DROP CONSTRAINT IF EXISTS valid_user_entitlements_plan_by_audience;

ALTER TABLE user_entitlements
  ADD CONSTRAINT valid_user_entitlements_plan_by_audience CHECK (
    (
      billing_audience = 'litigant'
      AND plan_family = 'litigant'
      AND plan_type = ANY (ARRAY[
        'No plan'::text,
        'Basic'::text,
        'Premium'::text,
        'Premium +'::text,
        'Assistant Plus'::text,
        'Assistant Pro'::text
      ])
      AND business_id IS NULL
    )
    OR (
      billing_audience = 'business'
      AND plan_family = 'business'
      AND plan_type = 'Solo'::text
      AND business_id IS NOT NULL
    )
  );
