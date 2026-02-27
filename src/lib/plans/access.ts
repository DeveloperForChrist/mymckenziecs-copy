export function normalizePlanLabel(value: unknown): string {
  if (!value) return '';
  return value.toString().trim().toLowerCase();
}

export function isBasicPlan(plan: unknown): boolean {
  const label = normalizePlanLabel(plan);
  return label.includes('basic');
}

export function isPaidPlan(plan: unknown): boolean {
  const label = normalizePlanLabel(plan);
  return isBasicPlan(label) || label.includes('premium') || label.includes('premium +');
}

export function isPremiumPlusPlan(plan: unknown): boolean {
  const label = normalizePlanLabel(plan);
  return label.includes('premium +');
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
  if (label.includes('basic')) return '18';
  if (label.includes('premium +')) return '199';
  if (label.includes('premium')) return '32';
  return '0';
}
