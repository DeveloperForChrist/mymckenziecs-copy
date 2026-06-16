#!/usr/bin/env node

/**
 * Create or refresh product demo accounts for MyMcKenzie.
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/db/create-product-demo-accounts.mjs [password]
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
const password = process.argv[2] || 'Pentagon100'

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const restHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

const demos = [
  {
    email: 'mymckenzie@demo.com',
    name: 'MyMcKenzie Assistant Demo',
    accountType: 'litigant',
    billingAudience: 'litigant',
    planFamily: 'litigant',
    planType: 'Assistant Pro',
    countryCode: 'GB',
    jurisdictionCode: 'GB-ENG-WLS',
    jurisdictionLabel: 'England and Wales',
    businessName: null,
  },
  {
    email: 'workspace@demo.com',
    name: 'Case Workspace Demo',
    accountType: 'litigant',
    billingAudience: 'litigant',
    planFamily: 'litigant',
    planType: 'Premium +',
    countryCode: 'GB',
    jurisdictionCode: 'GB-ENG-WLS',
    jurisdictionLabel: 'England and Wales',
    businessName: null,
  },
  {
    email: 'business@demo.com',
    name: 'Business Solo Demo',
    accountType: 'business',
    billingAudience: 'business',
    planFamily: 'business',
    planType: 'Solo',
    countryCode: 'GB',
    jurisdictionCode: 'GB-ENG-WLS',
    jurisdictionLabel: 'England and Wales',
    businessName: 'Demo Business Ltd',
  },
]

async function request(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      ...restHeaders,
      ...(options.headers || {}),
    },
  })

  const text = await response.text()
  const body = text ? JSON.parse(text) : null

  if (!response.ok) {
    const message = body?.message || body?.msg || body?.error_description || body?.error || text
    throw new Error(`${options.method || 'GET'} ${path}: ${message}`)
  }

  return body
}

async function listAuthUsers(page = 1) {
  return request(`/auth/v1/admin/users?page=${page}&per_page=1000`, {
    headers: { Prefer: undefined },
  })
}

async function findAuthUserByEmail(email) {
  const normalizedEmail = email.toLowerCase()
  let page = 1

  while (true) {
    const data = await listAuthUsers(page)
    const users = data?.users || []
    const user = users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail)

    if (user) return user
    if (users.length < 1000) return null
    page += 1
  }
}

async function ensureAuthUser(demo) {
  const metadata = {
    full_name: demo.name,
    display_name: demo.name,
    account_type: demo.accountType,
    billing_audience: demo.billingAudience,
    signup_source: 'product-demo',
  }
  const existingUser = await findAuthUserByEmail(demo.email)

  if (existingUser?.id) {
    return request(`/auth/v1/admin/users/${existingUser.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        password,
        email_confirm: true,
        user_metadata: {
          ...(existingUser.user_metadata || {}),
          ...metadata,
        },
      }),
    })
  }

  return request('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: demo.email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    }),
  })
}

async function upsert(table, payload, onConflict) {
  const query = new URLSearchParams({ on_conflict: onConflict })
  const rows = await request(`/rest/v1/${table}?${query}`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  })
  return Array.isArray(rows) ? rows[0] : rows
}

async function updateRows(table, payload, filters) {
  const query = new URLSearchParams(filters)
  await request(`/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { Prefer: 'return=minimal' },
  })
}

async function ensureBusiness(demo, userId, nowIso) {
  const payload = {
    owner_user_id: userId,
    name: demo.businessName,
    billing_email: demo.email,
    plan_type: demo.planType,
    status: 'active',
    updated_at: nowIso,
  }

  const query = new URLSearchParams({
    select: 'id',
    name: `eq.${demo.businessName}`,
    limit: '1',
  })
  const existingRows = await request(`/rest/v1/businesses?${query}`)

  let businessId
  if (existingRows[0]?.id) {
    businessId = existingRows[0].id
  } else {
    const business = await request('/rest/v1/businesses', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    businessId = business[0].id
  }

  // Add user as business member with owner role
  const memberPayload = {
    business_id: businessId,
    user_id: userId,
    role: 'owner',
    status: 'active',
    joined_at: nowIso,
  }
  await upsert('business_members', memberPayload, 'business_id,user_id')

  return businessId
}

async function ensureSubscription(userId, demo, businessId, nowIso) {
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
    billing_audience: demo.billingAudience,
    plan_family: demo.planFamily,
    business_id: businessId,
    updated_at: nowIso,
  }

  const query = new URLSearchParams({
    select: 'id',
    user_id: `eq.${userId}`,
    order: 'updated_at.desc',
    limit: '1',
  })
  const existingRows = await request(`/rest/v1/subscriptions?${query}`)

  if (existingRows[0]?.id) {
    await updateRows('subscriptions', payload, { id: `eq.${existingRows[0].id}` })
    await updateRows(
      'subscriptions',
      { status: 'cancelled', cancel_at_period_end: false, updated_at: nowIso },
      { user_id: `eq.${userId}`, id: `neq.${existingRows[0].id}` }
    )
    return { id: existingRows[0].id, currentPeriodEnd }
  }

  const subscription = await request('/rest/v1/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return { id: subscription[0].id, currentPeriodEnd }
}

async function ensureDemo(demo) {
  const nowIso = new Date().toISOString()
  const authUser = await ensureAuthUser(demo)
  const userId = authUser.id || authUser.user?.id

  if (!userId) throw new Error(`Supabase did not return a user id for ${demo.email}`)

  await upsert(
    'users',
    {
      id: userId,
      email: demo.email,
      name: demo.name,
      account_type: demo.accountType,
      billing_audience: demo.billingAudience,
      country_code: demo.countryCode,
      jurisdiction_code: demo.jurisdictionCode,
      jurisdiction_label: demo.jurisdictionLabel,
      email_verified_at: nowIso,
      updated_at: nowIso,
    },
    'id'
  )

  let businessId = null
  if (demo.billingAudience === 'business' && demo.businessName) {
    businessId = await ensureBusiness(demo, userId, nowIso)
  }

  const subscription = await ensureSubscription(userId, demo, businessId, nowIso)

  await upsert(
    'user_entitlements',
    {
      user_id: userId,
      plan_type: demo.planType,
      plan_status: 'active',
      next_billing_date: subscription.currentPeriodEnd,
      has_stripe_customer: false,
      paid_access: true,
      cancel_at_period_end: false,
      can_resume: false,
      archive_at: null,
      delete_at: null,
      scheduled_plan_type: null,
      scheduled_change_at: null,
      billing_audience: demo.billingAudience,
      plan_family: demo.planFamily,
      business_id: businessId,
      updated_at: nowIso,
    },
    'user_id'
  )

  return { email: demo.email, userId, planType: demo.planType, businessId }
}

console.log('Creating product demo accounts...')

for (const demo of demos) {
  const result = await ensureDemo(demo)
  const businessInfo = result.businessId ? ` [Business: ${result.businessId}]` : ''
  console.log(`- ${result.email}: ${result.planType} (${result.userId})${businessInfo}`)
}

console.log('Done.')
