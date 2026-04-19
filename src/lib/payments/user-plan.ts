import { entitlementPlanPrice, getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { isUserEmailVerified } from '@/lib/auth/account-verification';
import { isHardLockedTrialWithoutBilling, resolvePlatformAccess } from '@/lib/payments/platform-access';

export type UserPlanData = {
  plan: string;
  planStatus: string;
  planPrice: string;
  nextBillingDate: string | null;
  hasStripeCustomer: boolean;
  paidAccess: boolean;
  platformAccess: boolean;
  cancelAtPeriodEnd: boolean;
  canResume: boolean;
  archiveAt: string | null;
  deleteAt: string | null;
  scheduledPlan: string | null;
  scheduledChangeDate: string | null;
};

type GetUserPlanOptions = {
  bypassCache?: boolean;
};

type UserPlanCacheEntry = {
  expiresAt: number;
  value: UserPlanData;
};

const userPlanCache = new Map<string, UserPlanCacheEntry>();
const inFlightUserPlanRequests = new Map<string, Promise<UserPlanData>>();
const DEFAULT_PLAN_CACHE_TTL_MS = 15_000;
const DEFAULT_PLAN_PERF_WARN_MS = 200;

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const USER_PLAN_CACHE_TTL_MS = parsePositiveInt(process.env.USER_PLAN_CACHE_TTL_MS, DEFAULT_PLAN_CACHE_TTL_MS);
const USER_PLAN_PERF_WARN_MS = parsePositiveInt(process.env.USER_PLAN_PERF_WARN_MS, DEFAULT_PLAN_PERF_WARN_MS);
const SHOULD_LOG_PLAN_PERF = process.env.LOG_AUTH_PLAN_PERF === '1';

const cacheKeyForUserPlan = (authUid: string) => `plan:${authUid}`;

const readCachedPlan = (cacheKey: string): UserPlanData | null => {
  const cached = userPlanCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    userPlanCache.delete(cacheKey);
    return null;
  }
  return cached.value;
};

const writeCachedPlan = (cacheKey: string, value: UserPlanData) => {
  userPlanCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + USER_PLAN_CACHE_TTL_MS,
  });
};

const logPlanPerf = (phase: string, startMs: number, metadata: Record<string, string | number | boolean>) => {
  const durationMs = Date.now() - startMs;
  if (!SHOULD_LOG_PLAN_PERF && durationMs < USER_PLAN_PERF_WARN_MS) return;
  const details = Object.entries(metadata)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
  console.info(`[perf][plan] phase=${phase} duration_ms=${durationMs}${details ? ` ${details}` : ''}`);
};

export function invalidateUserPlanCache(authUid: string) {
  if (!authUid) return;
  const cacheKey = cacheKeyForUserPlan(authUid);
  userPlanCache.delete(cacheKey);
}

async function resolveUserPlanData(authUid: string): Promise<UserPlanData> {
  const snapshot = await getOrSyncUserEntitlementSnapshot(authUid);
  const rawPlan = snapshot?.plan_type || 'No plan';
  const planPrice = entitlementPlanPrice(rawPlan);
  const paidAccess = Boolean(snapshot?.paid_access);
  const emailVerified = await isUserEmailVerified(authUid);
  const hardLock = await isHardLockedTrialWithoutBilling(authUid, snapshot);

  return {
    plan: rawPlan,
    planStatus: snapshot?.plan_status || 'inactive',
    planPrice,
    nextBillingDate: snapshot?.next_billing_date || null,
    hasStripeCustomer: Boolean(snapshot?.has_stripe_customer),
    paidAccess,
    platformAccess: resolvePlatformAccess(emailVerified, snapshot, hardLock),
    cancelAtPeriodEnd: Boolean(snapshot?.cancel_at_period_end),
    canResume: Boolean(snapshot?.can_resume),
    archiveAt: snapshot?.archive_at || null,
    deleteAt: snapshot?.delete_at || null,
    scheduledPlan: snapshot?.scheduled_plan_type || null,
    scheduledChangeDate: snapshot?.scheduled_change_at || null,
  };
}

export async function getUserPlanData(
  authUid: string,
  _authEmail?: string | null,
  options?: GetUserPlanOptions
): Promise<UserPlanData> {
  if (options?.bypassCache) {
    const startedAt = Date.now();
    const value = await resolveUserPlanData(authUid);
    logPlanPerf('resolve-nocache', startedAt, {
      user: authUid,
      paidAccess: value.paidAccess,
      plan: value.plan,
      status: value.planStatus,
    });
    return value;
  }

  const cacheKey = cacheKeyForUserPlan(authUid);
  const cached = readCachedPlan(cacheKey);
  if (cached) return cached;

  const inFlight = inFlightUserPlanRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const resolvePromise = (async () => {
    const startedAt = Date.now();
    const value = await resolveUserPlanData(authUid);
    writeCachedPlan(cacheKey, value);
    logPlanPerf('resolve', startedAt, {
      user: authUid,
      paidAccess: value.paidAccess,
      plan: value.plan,
      status: value.planStatus,
    });
    return value;
  })().finally(() => {
    inFlightUserPlanRequests.delete(cacheKey);
  });

  inFlightUserPlanRequests.set(cacheKey, resolvePromise);
  return resolvePromise;
}
