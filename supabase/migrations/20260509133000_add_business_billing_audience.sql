-- Split personal/litigant plans from business workspace plans.
-- Existing rows are backfilled as litigant so Basic/Premium/Premium + behaviour is preserved.

CREATE TABLE IF NOT EXISTS public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  billing_email TEXT,
  plan_type TEXT NOT NULL DEFAULT 'Solo',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_business_plan_type CHECK (plan_type = ANY (ARRAY['Solo'::text, 'Team'::text, 'Enterprise'::text])),
  CONSTRAINT valid_business_status CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'suspended'::text, 'cancelled'::text]))
);

CREATE TABLE IF NOT EXISTS public.business_members (
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, user_id),
  CONSTRAINT valid_business_member_role CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text])),
  CONSTRAINT valid_business_member_status CHECK (status = ANY (ARRAY['active'::text, 'invited'::text, 'disabled'::text]))
);

CREATE TABLE IF NOT EXISTS public.business_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_business_invitation_role CHECK (role = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text])),
  CONSTRAINT valid_business_invitation_status CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text]))
);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_audience TEXT NOT NULL DEFAULT 'litigant',
  ADD COLUMN IF NOT EXISTS plan_family TEXT NOT NULL DEFAULT 'litigant',
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

ALTER TABLE public.user_entitlements
  ADD COLUMN IF NOT EXISTS billing_audience TEXT NOT NULL DEFAULT 'litigant',
  ADD COLUMN IF NOT EXISTS plan_family TEXT NOT NULL DEFAULT 'litigant',
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL;

UPDATE public.subscriptions
SET billing_audience = 'litigant',
    plan_family = 'litigant'
WHERE billing_audience IS NULL
   OR trim(billing_audience) = ''
   OR plan_family IS NULL
   OR trim(plan_family) = '';

UPDATE public.user_entitlements
SET billing_audience = 'litigant',
    plan_family = 'litigant'
WHERE billing_audience IS NULL
   OR trim(billing_audience) = ''
   OR plan_family IS NULL
   OR trim(plan_family) = '';

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS valid_plan_type,
  DROP CONSTRAINT IF EXISTS valid_billing_audience,
  DROP CONSTRAINT IF EXISTS valid_plan_family,
  DROP CONSTRAINT IF EXISTS valid_subscription_plan_by_audience;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT valid_billing_audience
    CHECK (billing_audience = ANY (ARRAY['litigant'::text, 'business'::text])),
  ADD CONSTRAINT valid_plan_family
    CHECK (plan_family = ANY (ARRAY['litigant'::text, 'business'::text])),
  ADD CONSTRAINT valid_subscription_plan_by_audience
    CHECK (
      (
        billing_audience = 'litigant'
        AND plan_family = 'litigant'
        AND plan_type = ANY (ARRAY['Basic'::text, 'Premium'::text, 'Premium +'::text])
        AND business_id IS NULL
      )
      OR
      (
        billing_audience = 'business'
        AND plan_family = 'business'
        AND plan_type = ANY (ARRAY['Solo'::text, 'Team'::text, 'Enterprise'::text])
        AND business_id IS NOT NULL
      )
    );

ALTER TABLE public.user_entitlements
  DROP CONSTRAINT IF EXISTS valid_user_entitlements_billing_audience,
  DROP CONSTRAINT IF EXISTS valid_user_entitlements_plan_family,
  DROP CONSTRAINT IF EXISTS valid_user_entitlements_plan_by_audience;

ALTER TABLE public.user_entitlements
  ADD CONSTRAINT valid_user_entitlements_billing_audience
    CHECK (billing_audience = ANY (ARRAY['litigant'::text, 'business'::text])),
  ADD CONSTRAINT valid_user_entitlements_plan_family
    CHECK (plan_family = ANY (ARRAY['litigant'::text, 'business'::text])),
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
        AND plan_type = ANY (ARRAY['Solo'::text, 'Team'::text, 'Enterprise'::text])
        AND business_id IS NOT NULL
      )
    );

CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_audience
  ON public.subscriptions (billing_audience, plan_family, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_business_id
  ON public.subscriptions (business_id, status, updated_at DESC)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_entitlements_billing_audience
  ON public.user_entitlements (billing_audience, plan_family, paid_access, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_business_id
  ON public.user_entitlements (business_id, paid_access, updated_at DESC)
  WHERE business_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_owner_user_id
  ON public.businesses (owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_members_user_id
  ON public.business_members (user_id, status);

CREATE INDEX IF NOT EXISTS idx_business_invitations_business_id
  ON public.business_invitations (business_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_invitations_email
  ON public.business_invitations (lower(email), status);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business owners can view own businesses" ON public.businesses;
CREATE POLICY "Business owners can view own businesses"
  ON public.businesses
  FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = businesses.id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Service role can manage businesses" ON public.businesses;
CREATE POLICY "Service role can manage businesses"
  ON public.businesses
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Business members can view memberships" ON public.business_members;
CREATE POLICY "Business members can view memberships"
  ON public.business_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_members.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Service role can manage business members" ON public.business_members;
CREATE POLICY "Service role can manage business members"
  ON public.business_members
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Business admins can view invitations" ON public.business_invitations;
CREATE POLICY "Business admins can view invitations"
  ON public.business_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_members bm
      WHERE bm.business_id = business_invitations.business_id
        AND bm.user_id = auth.uid()
        AND bm.status = 'active'
        AND bm.role = ANY (ARRAY['owner'::text, 'admin'::text])
    )
  );

DROP POLICY IF EXISTS "Service role can manage business invitations" ON public.business_invitations;
CREATE POLICY "Service role can manage business invitations"
  ON public.business_invitations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
