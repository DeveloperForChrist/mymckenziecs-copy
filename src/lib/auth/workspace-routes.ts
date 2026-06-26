import type { AccountType } from '@/lib/auth/account-type'

export type SignedInAppDestination = '/business/dashboard' | '/client-portal' | '/dashboard'

type SignedInAppDestinationFlags = {
  accountType: AccountType
  ownsBusinessWorkspace?: boolean
  hasClientPortalAccess?: boolean
}

type DashboardEntryFlags = {
  hasAuthUser: boolean
  isEligible: boolean
  emailVerified: boolean
  hasClientPortalAccess: boolean
}

export function resolveSignedInAppDestinationFromFlags({
  accountType,
  ownsBusinessWorkspace = false,
  hasClientPortalAccess = false,
}: SignedInAppDestinationFlags): SignedInAppDestination {
  if (accountType === 'business' || ownsBusinessWorkspace) {
    return '/business/dashboard'
  }

  if (hasClientPortalAccess) {
    return '/client-portal'
  }

  return '/dashboard'
}

export function buildSignInRedirectPath(target: string) {
  return `/auth/signin?redirect=${encodeURIComponent(target)}`
}

export function buildVerifyRedirectPath(target: string) {
  return `/auth/verify-email?redirect=${encodeURIComponent(target)}`
}

export function resolveDashboardEntryRedirect(
  { hasAuthUser, isEligible, emailVerified, hasClientPortalAccess }: DashboardEntryFlags,
  dashboardHref: string
) {
  if (!hasAuthUser || !isEligible) {
    return buildSignInRedirectPath(dashboardHref)
  }

  if (!emailVerified && hasClientPortalAccess) {
    return '/client-portal'
  }

  if (!emailVerified) {
    return buildVerifyRedirectPath(dashboardHref)
  }

  return null
}
