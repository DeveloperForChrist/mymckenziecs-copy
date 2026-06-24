import type { BillingMarket } from '@/constants';

export function normalizePlanLabel(value: unknown): string {
  if (!value) return '';
  return value.toString().trim().toLowerCase().replace(/_/g, ' ');
}

export type PlanTier = 'none' | 'basic' | 'premium' | 'premium_plus';

export function getPlanTier(plan: unknown): PlanTier {
  const label = normalizePlanLabel(plan);
  if (!label) return 'none';

  // Premium+ aliases
  if (
    label.includes('premium +') ||
    label.includes('premium plus') ||
    label.includes('premium pro') ||
    label === 'plus'
  ) {
    return 'premium_plus';
  }

  // Basic aliases
  if (
    label.includes('basic') ||
    label.includes('essential') ||
    label.includes('premium cheap')
  ) {
    return 'basic';
  }

  // Premium aliases
  if (label.includes('premium') || label.includes('standard')) {
    return 'premium';
  }

  if (label.includes('free')) return 'none';
  return 'none';
}

export function isBasicPlan(plan: unknown): boolean {
  return getPlanTier(plan) === 'basic';
}

export function isPremiumPlan(plan: unknown): boolean {
  const tier = getPlanTier(plan);
  return tier === 'premium';
}

export function isPaidPlan(plan: unknown): boolean {
  const tier = getPlanTier(plan);
  return tier === 'basic' || tier === 'premium' || tier === 'premium_plus';
}

export function isPremiumPlusPlan(plan: unknown): boolean {
  const tier = getPlanTier(plan);
  return tier === 'premium_plus';
}

export function isAssistantPlan(plan: unknown): boolean {
  return false;
}

export function hasCaseLawAccess(plan: unknown): boolean {
  const label = normalizePlanLabel(plan);
  // Business/professional plans should always have case-law access.
  if (
    label.includes('solo') ||
    label.includes('team') ||
    label.includes('enterprise') ||
    label.includes('business')
  ) {
    return true;
  }
  return isPremiumPlusPlan(plan);
}

export function hasCaseProfileAccess(plan: unknown): boolean {
  return isPaidPlan(plan) && !isBasicPlan(plan) && !isAssistantPlan(plan);
}

export function hasReminderAccess(plan: unknown): boolean {
  return isPaidPlan(plan) && !isBasicPlan(plan);
}

export function planPriceForLabel(plan: unknown, market: BillingMarket = 'GB'): string {
  const tier = getPlanTier(plan);
  if (tier === 'basic') return market === 'US' ? '32' : '18';
  if (tier === 'premium') return market === 'US' ? '58' : '32';
  if (tier === 'premium_plus') return market === 'US' ? '270' : '149';
  return '0';
}

const DOCUMENT_LIMITS: Record<PlanTier, number> = {
  none: 0,
  basic: 10,
  premium: 25,
  premium_plus: 150,
};

export function documentLimitForPlan(plan: unknown): number {
  const tier = getPlanTier(plan);
  return DOCUMENT_LIMITS[tier] ?? 0;
}

export function planDisplayName(plan: unknown): string {
  const tier = getPlanTier(plan);
  if (tier === 'basic') return 'Basic';
  if (tier === 'premium') return 'Premium';
  if (tier === 'premium_plus') return 'Premium +';
  return 'No plan';
}
