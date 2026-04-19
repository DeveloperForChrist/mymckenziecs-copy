import { serve } from 'https://deno.land/std@0.201.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

type TrialingSubscriptionRow = {
  id: string
  user_id: string
  plan_type: string
  status: string
  current_period_end: string | null
  updated_at: string | null
  stripe_subscription_id: string | null
  stripe_customer_id: string | null
  cancel_at_period_end: boolean
  scheduled_plan_type: string | null
  scheduled_change_at: string | null
  lifecycle_archive_at: string | null
  lifecycle_delete_at: string | null
  trial_reminder_days_sent: unknown
}

type LatestSubscriptionRow = {
  id: string
  user_id: string
  status: string
}

type EntitlementSnapshot = {
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
  updated_at: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const BILLING_ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due'])

const normalizePlanLabel = (value: unknown): string => String(value || '').trim().toLowerCase().replace(/_/g, ' ')

const isPaidPlan = (plan: unknown): boolean => {
  const label = normalizePlanLabel(plan)
  return (
    label.includes('basic') ||
    label.includes('essential') ||
    label.includes('premium cheap') ||
    label.includes('premium +') ||
    label.includes('premium plus') ||
    label.includes('premium pro') ||
    label === 'plus' ||
    label.includes('premium')
  )
}

async function buildEntitlementSnapshot(supabase: ReturnType<typeof createClient>, userId: string): Promise<EntitlementSnapshot> {
  const { data: latestSub, error } = await supabase
    .from('subscriptions')
    .select(
      'plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id, cancel_at_period_end, lifecycle_archive_at, lifecycle_delete_at, scheduled_plan_type, scheduled_change_at'
    )
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)

  const status = String(latestSub?.status || 'inactive').toLowerCase()
  const planType = String(latestSub?.plan_type || 'No plan')
  const paidAccess = isPaidPlan(planType) && BILLING_ACTIVE_STATUSES.has(status)
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

async function syncUserEntitlementSnapshot(supabase: ReturnType<typeof createClient>, userId: string) {
  const snapshot = await buildEntitlementSnapshot(supabase, userId)
  const { error } = await supabase.from('user_entitlements').upsert(snapshot, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')
    const serviceRoleKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SERVICE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Supabase env not configured' }), { status: 500 })
    }

    const now = new Date()

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

    const { data: trialingSubs, error } = await supabase
      .from('subscriptions')
      .select(
        'id, user_id, plan_type, status, current_period_end, updated_at, stripe_subscription_id, stripe_customer_id, cancel_at_period_end, scheduled_plan_type, scheduled_change_at, lifecycle_archive_at, lifecycle_delete_at'
      )
      .eq('status', 'trialing')
      .not('current_period_end', 'is', null)
      .order('updated_at', { ascending: false })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
    if (!trialingSubs || trialingSubs.length === 0) {
      return new Response(JSON.stringify({ ok: true, expired: 0 }), { status: 200 })
    }

    const latestTrialByUser = new Map<string, TrialingSubscriptionRow>()
    for (const row of trialingSubs as TrialingSubscriptionRow[]) {
      if (!row.user_id || latestTrialByUser.has(row.user_id)) continue
      latestTrialByUser.set(row.user_id, row)
    }

    const latestUserIds = Array.from(latestTrialByUser.keys())
    const { data: latestSubs, error: latestError } = await supabase
      .from('subscriptions')
      .select('id, user_id, status')
      .in('user_id', latestUserIds)
      .order('updated_at', { ascending: false })

    if (latestError) {
      return new Response(JSON.stringify({ error: latestError.message }), { status: 500 })
    }

    const latestOverallByUser = new Map<string, LatestSubscriptionRow>()
    for (const row of (latestSubs || []) as LatestSubscriptionRow[]) {
      if (!row.user_id || latestOverallByUser.has(row.user_id)) continue
      latestOverallByUser.set(row.user_id, row)
    }

    const targets = Array.from(latestTrialByUser.values()).filter((row) => {
      const latest = latestOverallByUser.get(row.user_id)
      if (!latest) return true
      return latest.id === row.id && String(latest.status || '').toLowerCase() === 'trialing'
    })

    if (targets.length === 0) {
      return new Response(JSON.stringify({ ok: true, expired: 0 }), { status: 200 })
    }

    let expired = 0

    for (const sub of targets) {
      if (!sub.user_id || !sub.current_period_end) continue

      if (!sub.stripe_subscription_id) {
        const trialEndMs = new Date(sub.current_period_end).getTime()
        if (Number.isFinite(trialEndMs) && trialEndMs <= now.getTime()) {
          const { error: expireError } = await supabase
            .from('subscriptions')
            .update({
              status: 'expired',
              updated_at: now.toISOString(),
            })
            .eq('id', sub.id)

          if (expireError) {
            console.error('Trial reminders: failed to expire local trial', expireError)
            continue
          }

          await syncUserEntitlementSnapshot(supabase, sub.user_id)
          expired += 1
          continue
        }
      }

      if (sub.cancel_at_period_end || sub.stripe_subscription_id) {
        continue
      }
    }

    return new Response(JSON.stringify({ ok: true, expired }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Standalone trial reminders edge function failed', error)
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
})
