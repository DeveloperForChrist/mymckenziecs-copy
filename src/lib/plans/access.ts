import type { BillingMarket } from '@/constants';

export function normalizePlanLabel(value: any): string {
  if (!value) return '';
  return value.toString().trim().toLowerCase().replace(/_/g, ' ');
}

export type PlanTier = 'none' | 'basic' | 'premium' | 'premium_plus';

export function getPlanTier(plan: any): PlanTier {
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

export function isBasicPlan(plan: any): boolean {
  return getPlanTier(plan) === 'basic';
}

export function isPremiumPlan(plan: any): boolean {
  return getPlanTier(plan) === 'premium';
}

export function isPaidPlan(plan: any): boolean {
  const tier = getPlanTier(plan);
  return tier === 'basic' || tier === 'premium' || tier === 'premium_plus';
}

export function isPremiumPlusPlan(plan: any): boolean {
  return getPlanTier(plan) === 'premium_plus';
}

export function hasCaseLawAccess(plan: any): boolean {
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

export function hasCaseProfileAccess(plan: any): boolean {
  return isPaidPlan(plan) && !isBasicPlan(plan);
}

export function hasReminderAccess(plan: any): boolean {
  return isPaidPlan(plan) && !isBasicPlan(plan);
}

export function planPriceForLabel(plan: any, market: BillingMarket = 'GB'): string {
  const tier = getPlanTier(plan);
  if (tier === 'basic') return market === 'US' ? '25' : '14';
  if (tier === 'premium') return market === 'US' ? '44' : '24';
  if (tier === 'premium_plus') return market === 'US' ? '270' : '149';
  return '0';
}

const DOCUMENT_LIMITS: Record<PlanTier, number> = {
  none: 0,
  basic: 10,
  premium: 25,
  premium_plus: 150,
};

export function documentLimitForPlan(plan: any): number {
  const tier = getPlanTier(plan);
  return DOCUMENT_LIMITS[tier] ?? 0;
}

export function planDisplayName(plan: any): string {
  const tier = getPlanTier(plan);
  if (tier === 'basic') return 'Basic';
  if (tier === 'premium') return 'Premium';
  if (tier === 'premium_plus') return 'Premium +';
  return 'No plan';
}
