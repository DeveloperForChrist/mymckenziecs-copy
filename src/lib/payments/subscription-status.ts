// These statuses unlock paid workspace access.
// `incomplete`/`unpaid` do not count as active access.
export const BILLING_ACTIVE_STATUSES = ['active', 'past_due'] as const;

export type BillingActiveStatus = (typeof BILLING_ACTIVE_STATUSES)[number];

export function normalizeStripeSubscriptionStatus(status?: string | null): string {
  const raw = (status || '').toLowerCase().trim();
  if (!raw) return 'active';
  if (raw === 'canceled') return 'cancelled';
  return raw;
}

export function isBillingActiveStripeStatus(status?: string | null): boolean {
  const normalized = normalizeStripeSubscriptionStatus(status);
  return BILLING_ACTIVE_STATUSES.includes(normalized as BillingActiveStatus);
}
