import type { BillingMarket } from './plan-prices';

export const BUSINESS_SOLO_INTRO_PRICE_IDS: Record<BillingMarket, string> = {
  GB: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_SOLO_INTRO_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_BUSINESS_SOLO_PRICE_ID || '',
  US: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_SOLO_INTRO_PRICE_ID_US || process.env.NEXT_PUBLIC_STRIPE_BUSINESS_SOLO_PRICE_ID_US || '',
};

export const BUSINESS_SOLO_STANDARD_PRICE_IDS: Record<BillingMarket, string> = {
  GB: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_SOLO_STANDARD_PRICE_ID || process.env.NEXT_PUBLIC_STRIPE_BUSINESS_SOLO_PRICE_ID || '',
  US: process.env.NEXT_PUBLIC_STRIPE_BUSINESS_SOLO_STANDARD_PRICE_ID_US || process.env.NEXT_PUBLIC_STRIPE_BUSINESS_SOLO_PRICE_ID_US || '',
};

export function getBusinessSoloIntroPriceId(market: BillingMarket = 'GB'): string {
  return BUSINESS_SOLO_INTRO_PRICE_IDS[market] || '';
}

export function getBusinessSoloStandardPriceId(market: BillingMarket = 'GB'): string {
  return BUSINESS_SOLO_STANDARD_PRICE_IDS[market] || '';
}

export function isKnownBusinessIntroPriceId(priceId?: string | null): boolean {
  const normalized = String(priceId || '').trim();
  if (!normalized) return false;
  return Object.values(BUSINESS_SOLO_INTRO_PRICE_IDS).some((value) => value && value === normalized);
}

export function isKnownBusinessStandardPriceId(priceId?: string | null): boolean {
  const normalized = String(priceId || '').trim();
  if (!normalized) return false;
  return Object.values(BUSINESS_SOLO_STANDARD_PRICE_IDS).some((value) => value && value === normalized);
}

export function isKnownBusinessPriceId(priceId?: string | null): boolean {
  return isKnownBusinessIntroPriceId(priceId) || isKnownBusinessStandardPriceId(priceId);
}

export function findBusinessMarketByPriceId(priceId?: string | null): BillingMarket | null {
  const normalized = String(priceId || '').trim();
  if (!normalized) return null;
  for (const [market, value] of Object.entries(BUSINESS_SOLO_INTRO_PRICE_IDS) as Array<[BillingMarket, string]>) {
    if (value && value === normalized) return market;
  }
  for (const [market, value] of Object.entries(BUSINESS_SOLO_STANDARD_PRICE_IDS) as Array<[BillingMarket, string]>) {
    if (value && value === normalized) return market;
  }
  return null;
}
