import { supabaseAdmin } from '@/lib/database/supabase-server';
import { BILLING_ACTIVE_STATUSES } from '@/lib/payments/subscription-status';
import { isPaidPlan, planPriceForLabel } from '@/lib/plans/access';

export type UserPlanData = {
  plan: string;
  planStatus: string;
  planPrice: string;
  nextBillingDate: string | null;
  hasStripeCustomer: boolean;
  paidAccess: boolean;
  cancelAtPeriodEnd: boolean;
  canResume: boolean;
  archiveAt: string | null;
  deleteAt: string | null;
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

const cacheKeyForUserPlan = (authUid: string, authEmail?: string | null) =>
  `${authUid}::${String(authEmail || '').trim().toLowerCase()}`;

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
  const prefix = `${authUid}::`;
  for (const key of userPlanCache.keys()) {
    if (key.startsWith(prefix)) userPlanCache.delete(key);
  }
}

async function resolveUserPlanData(authUid: string, authEmail?: string | null): Promise<UserPlanData> {
  const normalizedEmail = String(authEmail || '').trim();

  // Prefer currently billable subscription states first.
  const { data: activeSub } = await supabaseAdmin
    .from('subscriptions')
    .select(
      'plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id, cancel_at_period_end, lifecycle_archive_at, lifecycle_delete_at'
    )
    .eq('user_id', authUid)
    .in('status', [...BILLING_ACTIVE_STATUSES])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let resolvedSub = activeSub;

  // Extra fallback: handle environments where subscriptions are linked to a
  // legacy/mismatched user_id by resolving through the same auth email.
  if (!resolvedSub && normalizedEmail) {
    const { data: emailUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', normalizedEmail);

    let resolvedEmailUsers = emailUsers || [];
    if (resolvedEmailUsers.length === 0) {
      const { data: fallbackEmailUsers } = await supabaseAdmin
        .from('users')
        .select('id')
        .ilike('email', normalizedEmail);
      resolvedEmailUsers = fallbackEmailUsers || [];
    }

    const emailUserIds = resolvedEmailUsers.map((row: any) => row.id).filter(Boolean);
    if (emailUserIds.length > 0) {
      const { data: emailActiveSub } = await supabaseAdmin
        .from('subscriptions')
        .select(
          'plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id, cancel_at_period_end, lifecycle_archive_at, lifecycle_delete_at'
        )
        .in('user_id', emailUserIds)
        .in('status', [...BILLING_ACTIVE_STATUSES])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (emailActiveSub) {
        resolvedSub = emailActiveSub;
      }
    }
  }

  let latestSub: any = null;
  if (!resolvedSub) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id, cancel_at_period_end, lifecycle_archive_at, lifecycle_delete_at'
      )
      .eq('user_id', authUid)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    latestSub = data;
  }

  const displaySub = resolvedSub || latestSub;
  const rawPlan = displaySub?.plan_type || 'No plan';
  const planPrice = displaySub ? planPriceForLabel(rawPlan) : '0';
  const activeStatus = (resolvedSub?.status || '').toLowerCase();
  const paidAccess = Boolean(
    resolvedSub &&
      isPaidPlan(resolvedSub.plan_type) &&
      BILLING_ACTIVE_STATUSES.some((value) => value === activeStatus)
  );
  let hasStripeCustomer = !!(displaySub?.stripe_customer_id || displaySub?.stripe_subscription_id);

  if (!hasStripeCustomer) {
    const { data: latestCustomerSub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('user_id', authUid)
      .or('stripe_customer_id.not.is.null,stripe_subscription_id.not.is.null')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    hasStripeCustomer = !!(latestCustomerSub?.stripe_customer_id || latestCustomerSub?.stripe_subscription_id);
  }

  return {
    plan: rawPlan,
    planStatus: displaySub?.status || 'inactive',
    planPrice,
    nextBillingDate: displaySub?.current_period_end || null,
    hasStripeCustomer,
    paidAccess,
    cancelAtPeriodEnd: Boolean(displaySub?.cancel_at_period_end),
    canResume: !paidAccess && Boolean(displaySub?.stripe_customer_id || displaySub?.stripe_subscription_id),
    archiveAt: displaySub?.lifecycle_archive_at || null,
    deleteAt: displaySub?.lifecycle_delete_at || null,
  };
}

export async function getUserPlanData(
  authUid: string,
  authEmail?: string | null,
  options?: GetUserPlanOptions
): Promise<UserPlanData> {
  if (options?.bypassCache) {
    const startedAt = Date.now();
    const value = await resolveUserPlanData(authUid, authEmail);
    logPlanPerf('resolve-nocache', startedAt, {
      user: authUid,
      paidAccess: value.paidAccess,
      plan: value.plan,
      status: value.planStatus,
    });
    return value;
  }

  const cacheKey = cacheKeyForUserPlan(authUid, authEmail);
  const cached = readCachedPlan(cacheKey);
  if (cached) return cached;

  const inFlight = inFlightUserPlanRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const resolvePromise = (async () => {
    const startedAt = Date.now();
    const value = await resolveUserPlanData(authUid, authEmail);
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
