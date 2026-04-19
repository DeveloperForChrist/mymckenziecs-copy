import { isUserEmailVerified } from '@/lib/auth/account-verification'
import { getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements'

export async function hasUserPlatformAccess(userId: string): Promise<boolean> {
  if (!userId) return false

  const [emailVerified, entitlement] = await Promise.all([
    isUserEmailVerified(userId),
    getOrSyncUserEntitlementSnapshot(userId),
  ])

  return emailVerified || Boolean(entitlement?.paid_access)
}
