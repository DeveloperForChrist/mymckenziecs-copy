-- Convert demo users into business-professional accounts.
-- Criteria: users whose email or name contains "demo" (case-insensitive).

WITH demo_users AS (
  SELECT id, email, name
  FROM public.users
  WHERE email ILIKE '%demo%'
     OR name ILIKE '%demo%'
)
UPDATE public.users u
SET
  account_type = 'business',
  billing_audience = 'business'
FROM demo_users d
WHERE u.id = d.id;

INSERT INTO public.businesses (
  owner_user_id,
  name,
  billing_email,
  plan_type,
  status
)
SELECT
  u.id,
  CONCAT(COALESCE(NULLIF(u.name, ''), SPLIT_PART(u.email, '@', 1), 'Business'), ' Workspace'),
  u.email,
  'Solo',
  'active'
FROM public.users u
WHERE (u.email ILIKE '%demo%' OR u.name ILIKE '%demo%')
  AND NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.owner_user_id = u.id
  );

INSERT INTO public.business_members (
  business_id,
  user_id,
  role,
  status,
  joined_at
)
SELECT
  b.id,
  b.owner_user_id,
  'owner',
  'active',
  NOW()
FROM public.businesses b
JOIN public.users u ON u.id = b.owner_user_id
WHERE (u.email ILIKE '%demo%' OR u.name ILIKE '%demo%')
  AND NOT EXISTS (
    SELECT 1
    FROM public.business_members bm
  WHERE bm.business_id = b.id
      AND bm.user_id = b.owner_user_id
  );

INSERT INTO public.user_entitlements (
  user_id,
  business_id,
  plan_type,
  paid_access,
  updated_at,
  billing_audience,
  plan_family
)
SELECT
  u.id,
  b.id,
  'Solo',
  FALSE,
  NOW(),
  'business',
  'business'
FROM public.users u
JOIN public.businesses b ON b.owner_user_id = u.id
WHERE (u.email ILIKE '%demo%' OR u.name ILIKE '%demo%')
  AND NOT EXISTS (
    SELECT 1 FROM public.user_entitlements ue WHERE ue.user_id = u.id
  );

UPDATE public.user_entitlements ue
SET
  business_id = b.id,
  billing_audience = 'business',
  plan_family = 'business',
  plan_type = 'Solo',
  updated_at = NOW()
FROM public.users u
JOIN public.businesses b ON b.owner_user_id = u.id
WHERE ue.user_id = u.id
  AND (u.email ILIKE '%demo%' OR u.name ILIKE '%demo%');

UPDATE auth.users au
SET
  raw_user_meta_data = COALESCE(au.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
    'account_type', 'business',
    'billing_audience', 'business',
    'selected_business_plan', 'Solo'
  )
FROM public.users u
WHERE au.id = u.id
  AND (u.email ILIKE '%demo%' OR u.name ILIKE '%demo%');
