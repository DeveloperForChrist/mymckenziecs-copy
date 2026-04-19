import { isUserEmailVerified } from '@/lib/auth/account-verification'
import { getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements'
import { isHardLockedTrialWithoutBilling, resolvePlatformAccess } from '@/lib/payments/platform-access'

export async function hasUserPlatformAccess(userId: string): Promise<boolean> {
  if (!userId) return false

  const [emailVerified, entitlement] = await Promise.all([
    isUserEmailVerified(userId),
    getOrSyncUserEntitlementSnapshot(userId),
  ])

  const hardLock = await isHardLockedTrialWithoutBilling(userId, entitlement)
  return resolvePlatformAccess(emailVerified, entitlement, hardLock)
}
