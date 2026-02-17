import { PLAN_FEATURES } from "@/constants/plan-features";

function normalizePlanKey(plan: string): keyof typeof PLAN_FEATURES {
  const normalized = (plan || '').toLowerCase().trim();

  if (
    normalized.includes('premium cheap') ||
    normalized.includes('premium pro') ||
    normalized.includes('plus') ||
    normalized === 'pro'
  ) {
    return 'pro';
  }

  if (normalized.includes('premium') || normalized.includes('essential')) {
    return 'premium';
  }

  if (normalized.includes('standard')) {
    return 'standard';
  }

  return 'freemium';
}

export function getPlanFeatures(plan: string | keyof typeof PLAN_FEATURES) {
  const key =
    typeof plan === 'string'
      ? normalizePlanKey(plan)
      : (plan as keyof typeof PLAN_FEATURES);
  return PLAN_FEATURES[key] || PLAN_FEATURES.freemium;
}

export function canAccessFeature(plan: string, feature: keyof typeof PLAN_FEATURES["freemium"]) {
  return !!getPlanFeatures(plan)[feature];
}

export function getPlanLimit(plan: string, limit: keyof typeof PLAN_FEATURES["freemium"]) {
  return getPlanFeatures(plan)[limit];
}
