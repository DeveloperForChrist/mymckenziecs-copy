import { PLAN_FEATURES } from "@/constants/plan-features";

export function getPlanFeatures(plan: string | keyof typeof PLAN_FEATURES) {
  const key = plan as keyof typeof PLAN_FEATURES;
  return PLAN_FEATURES[key] || PLAN_FEATURES.freemium;
}

export function canAccessFeature(plan: string, feature: keyof typeof PLAN_FEATURES["freemium"]) {
  return !!getPlanFeatures(plan)[feature];
}

export function getPlanLimit(plan: string, limit: keyof typeof PLAN_FEATURES["freemium"]) {
  return getPlanFeatures(plan)[limit];
}
