import 'server-only';

import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/database/supabase-server';

export type AccountType = 'business' | 'litigant';

const BUSINESS_PLAN_LABELS = new Set(['solo']);
const ACCOUNT_TYPE_CACHE_TTL_MS = Number.isFinite(Number(process.env.ACCOUNT_TYPE_CACHE_TTL_MS))
  ? Math.max(1000, Math.floor(Number(process.env.ACCOUNT_TYPE_CACHE_TTL_MS)))
  : 60_000;

type AccountTypeCacheEntry = {
  expiresAt: number;
  value: AccountType;
};

const accountTypeCache = new Map<string, AccountTypeCacheEntry>();
const accountTypeInFlight = new Map<string, Promise<AccountType>>();

function normalizeAccountType(value: unknown): AccountType | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'business') return 'business';
  if (normalized === 'litigant') return 'litigant';
  return null;
}

export function getAccountTypeFromUserMetadata(user?: User | null): AccountType | null {
  if (!user) return null;

  const metadata = {
    ...(user.app_metadata || {}),
    ...(user.user_metadata || {}),
  } as Record<string, unknown>;

  return (
    normalizeAccountType(metadata.account_type) ||
    normalizeAccountType(metadata.billing_audience) ||
    normalizeAccountType(metadata.audience)
  );
}

export async function getAccountTypeForUser(user?: User | null): Promise<AccountType> {
  if (!user) return 'litigant';

  const metadataAccountType = getAccountTypeFromUserMetadata(user);
  if (metadataAccountType) return metadataAccountType;

  const cached = accountTypeCache.get(user.id);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) accountTypeCache.delete(user.id);

  const inFlight = accountTypeInFlight.get(user.id);
  if (inFlight) return inFlight;

  const resolvePromise = resolveAccountTypeForUser(user).then((value) => {
    accountTypeCache.set(user.id, {
      expiresAt: Date.now() + ACCOUNT_TYPE_CACHE_TTL_MS,
      value,
    });
    return value;
  }).finally(() => {
    accountTypeInFlight.delete(user.id);
  });

  accountTypeInFlight.set(user.id, resolvePromise);
  return resolvePromise;
}

async function resolveAccountTypeForUser(user: User): Promise<AccountType> {
  const { data: entitlement } = await supabaseAdmin
    .from('user_entitlements')
    .select('billing_audience, plan_family, plan_type')
    .eq('user_id', user.id)
    .maybeSingle();

  const entitlementAudience =
    normalizeAccountType((entitlement as any)?.billing_audience) ||
    normalizeAccountType((entitlement as any)?.plan_family);
  if (entitlementAudience) return entitlementAudience;

  if (BUSINESS_PLAN_LABELS.has(String((entitlement as any)?.plan_type || '').trim().toLowerCase())) {
    return 'business';
  }

  const { data: businessMember } = await supabaseAdmin
    .from('business_members')
    .select('business_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  return businessMember ? 'business' : 'litigant';
}
