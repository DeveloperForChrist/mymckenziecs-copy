import 'server-only'

import type { User } from '@supabase/supabase-js'
import { getAccountTypeForUser } from '@/lib/auth/account-type'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export type BusinessContext = {
  businessId: string
  userId: string
  role: string
}

export class BusinessWorkspaceError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'BusinessWorkspaceError'
    this.status = status
  }
}

function userDisplayName(user: User) {
  const metadata = user.user_metadata || {}
  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
  const displayName = typeof metadata.display_name === 'string' ? metadata.display_name.trim() : ''
  const emailName = user.email ? user.email.split('@')[0] : ''
  return fullName || displayName || emailName || 'Business workspace'
}

function selectedBusinessPlan(_user: User): 'Solo' {
  return 'Solo'
}

async function ensurePublicUser(user: User) {
  const email = user.email || `${user.id}@local.invalid`
  const name = userDisplayName(user)
  const { error } = await supabaseAdmin
    .from('users')
    .upsert(
      {
        id: user.id,
        email,
        name,
        account_type: 'business',
        billing_audience: 'business',
      },
      { onConflict: 'id' },
    )

  if (error) {
    throw new BusinessWorkspaceError('Unable to prepare business user profile.')
  }
}

export async function ensureBusinessContext(user: User): Promise<BusinessContext> {
  const accountType = await getAccountTypeForUser(user)
  if (accountType !== 'business') {
    throw new BusinessWorkspaceError('Business account required.', 403)
  }

  await ensurePublicUser(user)

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('business_members')
    .select('business_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new BusinessWorkspaceError('Unable to load business workspace.')
  }

  if (membership?.business_id) {
    return {
      businessId: String(membership.business_id),
      userId: user.id,
      role: String(membership.role || 'member'),
    }
  }

  const { data: ownedBusiness, error: ownedBusinessError } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('owner_user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (ownedBusinessError) {
    throw new BusinessWorkspaceError('Unable to load business workspace.')
  }

  let businessId = typeof ownedBusiness?.id === 'string' ? ownedBusiness.id : ''

  if (!businessId) {
    const { data: createdBusiness, error: createBusinessError } = await supabaseAdmin
      .from('businesses')
      .insert({
        owner_user_id: user.id,
        name: `${userDisplayName(user)} Workspace`,
        billing_email: user.email || null,
        plan_type: selectedBusinessPlan(user),
        status: 'active',
      })
      .select('id')
      .single()

    if (createBusinessError || !createdBusiness?.id) {
      throw new BusinessWorkspaceError('Unable to create business workspace.')
    }

    businessId = String(createdBusiness.id)
  }

  const { error: memberError } = await supabaseAdmin
    .from('business_members')
    .upsert(
      {
        business_id: businessId,
        user_id: user.id,
        role: 'owner',
        status: 'active',
        joined_at: new Date().toISOString(),
      },
      { onConflict: 'business_id,user_id' },
    )

  if (memberError) {
    throw new BusinessWorkspaceError('Unable to join business workspace.')
  }

  return {
    businessId,
    userId: user.id,
    role: 'owner',
  }
}
