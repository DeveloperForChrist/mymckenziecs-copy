// These statuses unlock paid workspace access.
// `incomplete`/`unpaid` do not count as active access.
export const BILLING_ACTIVE_STATUSES = ['active', 'trialing', 'past_due'] as const;

export type BillingActiveStatus = (typeof BILLING_ACTIVE_STATUSES)[number];

export function normalizeStripeSubscriptionStatus(status?: string | null): string {
  const raw = (status || '').toLowerCase().trim();
  if (!raw) return 'incomplete';
  if (raw === 'canceled') return 'cancelled';
  return raw;
}

export function isTrialingStripeStatus(status?: string | null): boolean {
  return normalizeStripeSubscriptionStatus(status) === 'trialing';
}

export function isBillingActiveStripeStatus(status?: string | null): boolean {
  const normalized = normalizeStripeSubscriptionStatus(status);
  return BILLING_ACTIVE_STATUSES.includes(normalized as BillingActiveStatus);
}
