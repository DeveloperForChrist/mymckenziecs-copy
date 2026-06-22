import { supabaseAdmin } from '@/lib/database/supabase-server'
import { isBillingActiveStripeStatus } from '@/lib/payments/subscription-status'
import { isPaidPlan, planPriceForLabel } from '@/lib/plans/access'

export type UserEntitlementSnapshot = {
  user_id: string
  plan_type: string
  plan_status: string
  next_billing_date: string | null
  has_stripe_customer: boolean
  paid_access: boolean
  cancel_at_period_end: boolean
  can_resume: boolean
  archive_at: string | null
  delete_at: string | null
  scheduled_plan_type: string | null
  scheduled_change_at: string | null
  updated_at?: string
}

export async function buildEntitlementSnapshot(userId: string): Promise<UserEntitlementSnapshot> {
  const { data: latestSub } = await supabaseAdmin
    .from('subscriptions')
    .select(
      'plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id, cancel_at_period_end, lifecycle_archive_at, lifecycle_delete_at, scheduled_plan_type, scheduled_change_at'
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const status = String(latestSub?.status || 'inactive').toLowerCase()
  const planType = String(latestSub?.plan_type || 'No plan')
  const paidAccess = isPaidPlan(planType) && isBillingActiveStripeStatus(status)
  const hasStripeCustomer = Boolean(latestSub?.stripe_customer_id || latestSub?.stripe_subscription_id)

  return {
    user_id: userId,
    plan_type: planType,
    plan_status: status || 'inactive',
    next_billing_date: latestSub?.current_period_end || null,
    has_stripe_customer: hasStripeCustomer,
    paid_access: paidAccess,
    cancel_at_period_end: Boolean(latestSub?.cancel_at_period_end),
    can_resume: !paidAccess && hasStripeCustomer,
    archive_at: latestSub?.lifecycle_archive_at || null,
    delete_at: latestSub?.lifecycle_delete_at || null,
    scheduled_plan_type: latestSub?.scheduled_plan_type || null,
    scheduled_change_at: latestSub?.scheduled_change_at || null,
    updated_at: new Date().toISOString(),
  }
}

export async function syncUserEntitlementSnapshot(userId: string) {
  if (!userId) return null
  const snapshot = await buildEntitlementSnapshot(userId)
  const { error } = await supabaseAdmin
    .from('user_entitlements')
    .upsert(snapshot, { onConflict: 'user_id' })

  if (error) {
    console.error('Failed to sync user entitlement snapshot', error)
    return null
  }
  return snapshot
}

export async function getUserEntitlementSnapshot(userId: string) {
  if (!userId) return null

  const { data } = await supabaseAdmin
    .from('user_entitlements')
    .select(
      'user_id, plan_type, plan_status, next_billing_date, has_stripe_customer, paid_access, cancel_at_period_end, can_resume, archive_at, delete_at, scheduled_plan_type, scheduled_change_at'
    )
    .eq('user_id', userId)
    .maybeSingle()

  return data as UserEntitlementSnapshot | null
}

export async function getOrSyncUserEntitlementSnapshot(userId: string) {
  const snapshot = await getUserEntitlementSnapshot(userId)
  if (snapshot) return snapshot
  return syncUserEntitlementSnapshot(userId)
}

export const entitlementPlanPrice = (planType?: string | null) => planPriceForLabel(planType || 'No plan')
