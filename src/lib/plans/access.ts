export function normalizePlanLabel(value: unknown): string {
  if (!value) return '';
  return value.toString().trim().toLowerCase();
}

export function isBasicPlan(plan: unknown): boolean {
  const label = normalizePlanLabel(plan);
  return (
    label.includes('basic') ||
    label.includes('essential') ||
    label.includes('premium cheap')
  );
}

export function isPaidPlan(plan: unknown): boolean {
  const label = normalizePlanLabel(plan);
  return (
    isBasicPlan(label) ||
    label.includes('premium') ||
    label.includes('premium +') ||
    label.includes('premium plus') ||
    label.includes('plus') ||
    label.includes('pro') ||
    label.includes('premium cheap')
  );
}

export function isPremiumPlusPlan(plan: unknown): boolean {
  const label = normalizePlanLabel(plan);
  return (
    label.includes('premium +') ||
    label.includes('premium plus') ||
    label.includes('plus') ||
    label.includes('premium pro')
  );
}

export function hasCaseLawAccess(plan: unknown): boolean {
  return isPremiumPlusPlan(plan);
}

export function hasCaseProfileAccess(plan: unknown): boolean {
  return isPaidPlan(plan) && !isBasicPlan(plan);
}

export function hasReminderAccess(plan: unknown): boolean {
  return isPaidPlan(plan) && !isBasicPlan(plan);
}

export function planPriceForLabel(plan: unknown): string {
  const label = normalizePlanLabel(plan).replace(/_/g, ' ');
  if (label.includes('basic') || label.includes('essential') || label.includes('premium cheap')) return '18';
  if (label.includes('premium +') || label.includes('premium plus') || label.includes('plus') || label.includes('premium pro')) return '199';
  if (label.includes('premium')) return '32';
  return '0';
}
