import 'server-only'

import type { User } from '@supabase/supabase-js'
import { getAccountTypeForUser } from '@/lib/auth/account-type'
import { isUserEmailVerified } from '@/lib/auth/account-verification'
import { hasActiveClientPortalAccess } from '@/lib/auth/client-portal-access'
import { getDashboardSession } from '@/lib/auth/dashboard-session'
import {
  buildVerifyRedirectPath,
  resolveDashboardEntryRedirect,
  resolveSignedInAppDestinationFromFlags,
  type SignedInAppDestination,
} from '@/lib/auth/workspace-routes'
import { createSupabasePageClient } from '@/lib/database/supabase-page'
import { supabaseAdmin } from '@/lib/database/supabase-server'

async function hasOwnedBusinessWorkspace(userId: string) {
  if (!userId) return false

  const { data, error } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('owner_user_id', userId)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Failed to load owned business workspace state', error)
    return false
  }

  return Boolean(data?.id)
}

export async function getServerAuthUser() {
  const supabase = await createSupabasePageClient()
  const { data: authData } = await supabase.auth.getUser()

  return {
    supabase,
    authUser: authData?.user ?? null,
  }
}

export async function resolveSignedInAppDestination(user?: User | null): Promise<SignedInAppDestination | null> {
  if (!user) return null

  const [accountType, ownsBusinessWorkspace, hasClientPortalAccess] = await Promise.all([
    getAccountTypeForUser(user),
    hasOwnedBusinessWorkspace(user.id),
    hasActiveClientPortalAccess(user.id),
  ])

  return resolveSignedInAppDestinationFromFlags({
    accountType,
    ownsBusinessWorkspace,
    hasClientPortalAccess,
  })
}

export async function getDashboardEntryState(dashboardHref: string) {
  const session = await getDashboardSession()

  return {
    session,
    redirectPath: resolveDashboardEntryRedirect(
      {
        hasAuthUser: Boolean(session.authUser),
        isEligible: session.isEligible,
        emailVerified: session.emailVerified,
        hasClientPortalAccess: session.hasClientPortalAccess,
      },
      dashboardHref
    ),
  }
}

export async function resolveWorkspaceShortcutRedirect(
  user: User,
  dashboardHref: string,
  options: { paidAccess: boolean }
) {
  if (options.paidAccess) {
    return dashboardHref
  }

  const [emailVerified, hasClientPortalAccess] = await Promise.all([
    isUserEmailVerified(user.id),
    hasActiveClientPortalAccess(user.id),
  ])

  if (emailVerified) {
    return dashboardHref
  }

  if (hasClientPortalAccess) {
    return '/client-portal'
  }

  return buildVerifyRedirectPath(dashboardHref)
}
