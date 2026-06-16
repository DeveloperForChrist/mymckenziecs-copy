#!/usr/bin/env node

/**
 * Create or refresh MyMcKenzie Assistant demo accounts.
 *
 * Usage:
 *   node scripts/db/create-assistant-demo-accounts.mjs [password]
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.argv[2] || 'Ja22aaj'

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL')
  console.error('  SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const demos = [
  {
    email: 'free@demo.com',
    name: 'Free Demo',
    planType: 'No plan',
    paidAccess: false,
    countryCode: 'GB',
    jurisdictionCode: 'GB-ENG-WLS',
    jurisdictionLabel: 'England and Wales',
  },
  {
    email: 'plus@demo.com',
    name: 'Assistant Plus Demo',
    planType: 'Assistant Plus',
    paidAccess: true,
    countryCode: 'GB',
    jurisdictionCode: 'GB-ENG-WLS',
    jurisdictionLabel: 'England and Wales',
  },
  {
    email: 'pro@demo.com',
    name: 'Assistant Pro Demo',
    planType: 'Assistant Pro',
    paidAccess: true,
    countryCode: 'GB',
    jurisdictionCode: 'GB-ENG-WLS',
    jurisdictionLabel: 'England and Wales',
  },
]

async function findAuthUserByEmail(email) {
  const normalized = email.toLowerCase()
  let page = 1

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`Unable to list users: ${error.message}`)

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalized)
    if (user) return user
    if (data.users.length < 1000) return null
    page += 1
  }
}

async function ensureAuthUser(demo) {
  const existingUser = await findAuthUserByEmail(demo.email)

  if (existingUser?.id) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser.user_metadata || {}),
        full_name: demo.name,
        display_name: demo.name,
        account_type: 'litigant',
        billing_audience: 'litigant',
        country_code: demo.countryCode,
        jurisdiction_code: demo.jurisdictionCode,
        jurisdiction_label: demo.jurisdictionLabel,
        signup_source: 'assistant-demo',
      },
    })
    if (error) throw new Error(`Unable to refresh ${demo.email}: ${error.message}`)
    return data.user
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: demo.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: demo.name,
      display_name: demo.name,
      account_type: 'litigant',
      billing_audience: 'litigant',
      signup_source: 'assistant-demo',
    },
  })

  if (error || !data.user?.id) {
    throw new Error(`Unable to create ${demo.email}: ${error?.message || 'Unknown error'}`)
  }

  return data.user
}

async function ensureProfile(user, demo, nowIso) {
  const { error } = await supabase
    .from('users')
    .upsert(
      {
        id: user.id,
        email: demo.email,
        name: demo.name,
        account_type: 'litigant',
        billing_audience: 'litigant',
        email_verified_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    )

  if (error) throw new Error(`Unable to upsert profile for ${demo.email}: ${error.message}`)
}

async function cancelOtherSubscriptions(userId, keepSubscriptionId, nowIso) {
  let query = supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancel_at_period_end: false,
      updated_at: nowIso,
    })
    .eq('user_id', userId)

  if (keepSubscriptionId) query = query.neq('id', keepSubscriptionId)

  const { error } = await query
  if (error) throw new Error(`Unable to cancel previous subscriptions: ${error.message}`)
}

async function ensureSubscription(userId, demo, nowIso) {
  if (!demo.paidAccess) {
    await cancelOtherSubscriptions(userId, null, nowIso)
    return null
  }

  const currentPeriodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
  const payload = {
    user_id: userId,
    plan_type: demo.planType,
    status: 'active',
    current_period_start: nowIso,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: false,
    scheduled_plan_type: null,
    scheduled_change_at: null,
    billing_audience: 'litigant',
    plan_family: 'litigant',
    business_id: null,
    updated_at: nowIso,
  }

  const { data: existingSubscription, error: existingError } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw new Error(`Unable to load existing subscription for ${demo.email}: ${existingError.message}`)
  }

  if (existingSubscription?.id) {
    const { error } = await supabase.from('subscriptions').update(payload).eq('id', existingSubscription.id)
    if (error) throw new Error(`Unable to update subscription for ${demo.email}: ${error.message}`)
    await cancelOtherSubscriptions(userId, existingSubscription.id, nowIso)
    return { id: existingSubscription.id, currentPeriodEnd }
  }

  const { data, error } = await supabase.from('subscriptions').insert(payload).select('id').single()
  if (error) throw new Error(`Unable to create subscription for ${demo.email}: ${error.message}`)
  return { id: data.id, currentPeriodEnd }
}

async function ensureEntitlement(userId, demo, subscription, nowIso) {
  const { error } = await supabase
    .from('user_entitlements')
    .upsert(
      {
        user_id: userId,
        plan_type: demo.planType,
        plan_status: demo.paidAccess ? 'active' : 'inactive',
        next_billing_date: subscription?.currentPeriodEnd || null,
        has_stripe_customer: false,
        paid_access: demo.paidAccess,
        cancel_at_period_end: false,
        can_resume: false,
        archive_at: null,
        delete_at: null,
        scheduled_plan_type: null,
        scheduled_change_at: null,
        billing_audience: 'litigant',
        plan_family: 'litigant',
        business_id: null,
        updated_at: nowIso,
      },
      { onConflict: 'user_id' }
    )

  if (error) throw new Error(`Unable to upsert entitlement for ${demo.email}: ${error.message}`)
}

async function main() {
  console.log('Creating MyMcKenzie Assistant demo accounts...')

  for (const demo of demos) {
    const nowIso = new Date().toISOString()
    const user = await ensureAuthUser(demo)
    await ensureProfile(user, demo, nowIso)
    const subscription = await ensureSubscription(user.id, demo, nowIso)
    await ensureEntitlement(user.id, demo, subscription, nowIso)
    console.log(`- ${demo.email}: ${demo.planType}`)
  }

  console.log('Done.')
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
