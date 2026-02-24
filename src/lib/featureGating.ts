import { PLAN_FEATURES } from "@/constants/plan-features";

function normalizePlanKey(plan: string): keyof typeof PLAN_FEATURES {
  const normalized = (plan || '').toLowerCase().trim();

  if (
    normalized.includes('basic') ||
    normalized.includes('essential') ||
    normalized.includes('premium cheap')
  ) {
    return 'basic';
  }

  if (
    normalized.includes('premium +') ||
    normalized.includes('premium plus') ||
    normalized.includes('premium pro') ||
    normalized.includes('plus') ||
    normalized === 'pro'
  ) {
    return 'pro';
  }

  if (normalized.includes('premium')) {
    return 'premium';
  }

  return 'basic';
}

export function getPlanFeatures(plan: string | keyof typeof PLAN_FEATURES) {
  const key =
    typeof plan === 'string'
      ? normalizePlanKey(plan)
      : (plan as keyof typeof PLAN_FEATURES);
  return PLAN_FEATURES[key] || PLAN_FEATURES.basic;
}

export function canAccessFeature(plan: string, feature: keyof typeof PLAN_FEATURES["premium"]) {
  return !!getPlanFeatures(plan)[feature];
}

export function getPlanLimit(plan: string, limit: keyof typeof PLAN_FEATURES["premium"]) {
  return getPlanFeatures(plan)[limit];
}
