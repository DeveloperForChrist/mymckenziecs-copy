export function normalizePlanLabel(value: unknown): string {
  if (!value) return '';
  return value.toString().trim().toLowerCase();
}

export function isPaidPlan(plan: unknown): boolean {
  const label = normalizePlanLabel(plan);
  return (
    label.includes('standard') ||
    label.includes('essential') ||
    label.includes('plus') ||
    label.includes('premium') ||
    label.includes('pro')
  );
}

export function isFreemiumPlan(plan: unknown): boolean {
  return !isPaidPlan(plan);
}

export function hasCaseLawAccess(plan: unknown): boolean {
  const label = normalizePlanLabel(plan);
  if (!label) return false;
  return (
    label.includes('essential') ||
    label.includes('plus') ||
    label.includes('premium cheap') ||
    label.includes('premium pro')
  );
}

export function planPriceForLabel(plan: unknown): string {
  const label = normalizePlanLabel(plan).replace(/_/g, ' ');
  if (label.includes('premium cheap')) return '1';
  if (label.includes('plus') || label.includes('premium pro')) return '45';
  if (label.includes('essential') || label.includes('premium')) return '25';
  if (label.includes('standard')) return '15';
  return '0';
}
