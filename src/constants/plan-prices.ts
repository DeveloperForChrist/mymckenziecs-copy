import type { SupportedCountryCode } from '@/lib/legal/jurisdictions';

export type BillingMarket = Extract<SupportedCountryCode, 'GB' | 'US'>;

export type PlanPriceConfig = {
  name: 'Basic' | 'Premium' | 'Premium +';
  priceId: string;
  priceIds: Record<BillingMarket, string>;
  display: string;
  displayByMarket: Record<BillingMarket, string>;
  features: string[];
};

// Stripe price IDs for plans (replace with your actual price IDs if different)
export const DEADLINE_REMINDER_FEATURE = 'Scheduled series of deadline reminder emails (21, 14, 7, 5, 3, and 1 day before)';

const basicGbPriceId =
  process.env.NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID ||
  process.env.NEXT_PUBLIC_STRIPE_ESSENTIAL_PRICE_ID ||
  '';

const basicUsPriceId =
  process.env.NEXT_PUBLIC_STRIPE_BASIC_PRICE_ID_US ||
  '';

const premiumGbPriceId =
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ||
  '';

const premiumUsPriceId =
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID_US ||
  '';

const premiumPlusGbPriceId =
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PLUS_PRICE_ID ||
  process.env.NEXT_PUBLIC_STRIPE_PLUS_PRICE_ID ||
  '';

const premiumPlusUsPriceId =
  process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PLUS_PRICE_ID_US ||
  '';

export const PLAN_PRICES: PlanPriceConfig[] = [
  {
    name: 'Basic',
    priceId: basicGbPriceId,
    priceIds: {
      GB: basicGbPriceId,
      US: basicUsPriceId,
    },
    display: '£18/Month',
    displayByMarket: {
      GB: '£18/Month',
      US: '$25/Month',
    },
    features: [
      'MyMcKenzieCS Basic Assistant',
      '10 document storage',
      'Conversation history included',
      'Limited daily web research with source citations',
    ],
  },
  {
    name: 'Premium',
    priceId: premiumGbPriceId,
    priceIds: {
      GB: premiumGbPriceId,
      US: premiumUsPriceId,
    },
    display: '£32/Month',
    displayByMarket: {
      GB: '£32/Month',
      US: '$44/Month',
    },
    features: [
      'MyMcKenzieCS Smart Assistant',
      '25 document storage',
      'Conversation history included',
      'Expanded web research with source citations',
      DEADLINE_REMINDER_FEATURE,
    ],
  },
  {
    name: 'Premium +',
    priceId: premiumPlusGbPriceId,
    priceIds: {
      GB: premiumPlusGbPriceId,
      US: premiumPlusUsPriceId,
    },
    display: '£199/Month',
    displayByMarket: {
      GB: '£199/Month',
      US: '$270/Month',
    },
    features: [
      'MyMcKenzieCS Intelligent Assistant',
      '150 document storage',
      'Persistent chat history',
      'Enhanced research support with source citations',
      'Advanced case law retrieval and study',
      DEADLINE_REMINDER_FEATURE,
    ],
  },
];

const planNameMap = new Map(
  PLAN_PRICES.map((plan) => [plan.name.toLowerCase(), plan])
);

const priceIdMap = new Map<string, PlanPriceConfig>();
for (const plan of PLAN_PRICES) {
  for (const priceId of Object.values(plan.priceIds)) {
    if (!priceId) continue;
    priceIdMap.set(priceId, plan);
  }
}

export function getBillingMarketFromCountryCode(countryCode?: string | null): BillingMarket {
  return String(countryCode || '').trim().toUpperCase() === 'US' ? 'US' : 'GB';
}

export function getPlanConfig(planName?: string | null): PlanPriceConfig | null {
  if (!planName) return null;
  return planNameMap.get(planName.trim().toLowerCase()) || null;
}

export function getPlanPriceId(planName?: string | null, market: BillingMarket = 'GB'): string {
  const plan = getPlanConfig(planName);
  if (!plan) return '';
  return plan.priceIds[market] || plan.priceId || '';
}

export function getPlanFeatures(planName?: string | null): string[] {
  return getPlanConfig(planName)?.features || [];
}

export function findPlanByAnyPriceId(priceId?: string | null): PlanPriceConfig | null {
  if (!priceId) return null;
  return priceIdMap.get(priceId.trim()) || null;
}

export function isKnownPlanPriceId(priceId?: string | null): boolean {
  return Boolean(findPlanByAnyPriceId(priceId));
}

export function findMarketByPriceId(priceId?: string | null): BillingMarket | null {
  const normalizedPriceId = priceId?.trim();
  if (!normalizedPriceId) return null;

  for (const plan of PLAN_PRICES) {
    for (const [market, candidatePriceId] of Object.entries(plan.priceIds)) {
      if (candidatePriceId && candidatePriceId === normalizedPriceId) {
        return market as BillingMarket;
      }
    }
  }

  return null;
}
