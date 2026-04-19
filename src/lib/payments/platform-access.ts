import type { UserEntitlementSnapshot } from '@/lib/payments/entitlements'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { isPaidPlan } from '@/lib/plans/access'

const HARD_LOCK_STATUSES = new Set(['expired', 'cancelled'])

type LatestSubscriptionAccessState = {
  plan_type: string | null
  status: string | null
  stripe_subscription_id: string | null
}

export async function isHardLockedTrialWithoutBilling(
  userId: string,
  snapshot?: UserEntitlementSnapshot | null
): Promise<boolean> {
  if (!userId) return false

  const snapshotPlanType = String(snapshot?.plan_type || 'No plan')
  const snapshotPlanStatus = String(snapshot?.plan_status || 'inactive').toLowerCase().trim()

  if (!isPaidPlan(snapshotPlanType) || !HARD_LOCK_STATUSES.has(snapshotPlanStatus)) {
    return false
  }

  const { data: latestSubRaw } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_type, status, stripe_subscription_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const latestSub = (latestSubRaw || null) as LatestSubscriptionAccessState | null

  const planType = String(latestSub?.plan_type || snapshotPlanType || 'No plan')
  const planStatus = String(latestSub?.status || snapshotPlanStatus || 'inactive').toLowerCase().trim()
  const hasStripeSubscription = Boolean(latestSub?.stripe_subscription_id)

  return isPaidPlan(planType) && HARD_LOCK_STATUSES.has(planStatus) && !hasStripeSubscription
}

export function resolvePlatformAccess(
  emailVerified: boolean,
  snapshot?: UserEntitlementSnapshot | null,
  hardLock = false
): boolean {
  if (hardLock) return false
  return Boolean(snapshot?.paid_access) || emailVerified
}
