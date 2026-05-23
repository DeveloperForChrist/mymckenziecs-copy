import 'server-only';

import type { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/database/supabase-server';

export type AccountType = 'business' | 'litigant';

const BUSINESS_PLAN_LABELS = new Set(['solo']);

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
