import type { SupportedCountryCode } from '@/lib/legal/jurisdictions';

export type PublicMarket = Extract<SupportedCountryCode, 'GB' | 'US'>;

const EXACT_ROUTE_BY_MARKET: Record<PublicMarket, Record<string, string>> = {
  GB: {
    '/': '/uk',
    '/about': '/uk/about',
    '/pricing': '/uk/pricing',
    '/faq': '/uk/faq',
    '/help': '/uk/help',
    '/privacy-policy': '/uk/privacy-policy',
    '/terms': '/uk/terms',
    '/cookie-policy': '/uk/cookie-policy',
    '/contact': '/uk/contact',
    '/legal-case-management-tool': '/uk/legal-case-management-tool',
    '/litigant-in-person-uk': '/uk/litigant-in-person-uk',
    '/how-to-prepare-small-claims-court-uk': '/uk/how-to-prepare-small-claims-court-uk',
    '/small-claims-court-uk': '/uk/small-claims-court-uk',
    '/organise-court-documents-uk': '/uk/organise-court-documents-uk',
    '/court-bundle-preparation-uk': '/uk/court-bundle-preparation-uk',
    '/case-law-search-uk': '/uk/case-law-search-uk',
    '/witness-statement-uk': '/uk/witness-statement-uk',
    '/directions-questionnaire-uk': '/uk/directions-questionnaire-uk',
    '/serving-court-documents-uk': '/uk/serving-court-documents-uk',
    '/do-you-need-a-lawyer-for-small-claims-court-uk': '/uk/do-you-need-a-lawyer-for-small-claims-court-uk',
    '/mckenzie-friend-support': '/uk/mckenzie-friend-support',
  },
  US: {
    '/': '/us',
    '/about': '/us/about',
    '/pricing': '/us/pricing',
    '/faq': '/us/faq',
    '/help': '/us/help',
    '/privacy-policy': '/us/privacy-policy',
    '/terms': '/us/terms',
    '/cookie-policy': '/us/cookie-policy',
    '/contact': '/us/contact',
    '/legal-case-management-tool': '/us/legal-case-management-tool',
    '/litigant-in-person-uk': '/us/self-represented-litigant-guide',
    '/how-to-prepare-small-claims-court-uk': '/us/small-claims-court-guide',
    '/small-claims-court-uk': '/us/small-claims-court-guide',
    '/organise-court-documents-uk': '/us/organize-court-documents',
    '/court-bundle-preparation-uk': '/us/organize-court-documents',
    '/case-law-search-uk': '/us/case-law-research',
  },
};

export function normalizePublicMarket(value?: string | null): PublicMarket {
  return String(value || '').trim().toUpperCase() === 'US' ? 'US' : 'GB';
}

export function getPublicMarketFromPathname(pathname?: string | null): PublicMarket {
  return String(pathname || '').startsWith('/us') ? 'US' : 'GB';
}

export function getPublicMarket(options?: {
  pathname?: string | null;
  explicitMarket?: string | null;
  countryCode?: string | null;
}): PublicMarket {
  if (options?.explicitMarket) {
    return normalizePublicMarket(options.explicitMarket);
  }
  if (options?.countryCode) {
    return normalizePublicMarket(options.countryCode);
  }
  return getPublicMarketFromPathname(options?.pathname);
}

export function getPublicRouteForMarket(path: string, market: PublicMarket): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return EXACT_ROUTE_BY_MARKET[market][normalizedPath] || normalizedPath;
}

export function addMarketQueryParam(href: string, market: PublicMarket): string {
  if (market !== 'US') return href;
  const parsed = new URL(href, 'https://app.local');
  parsed.searchParams.set('market', 'US');
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function buildMarketAwareAuthHref(
  href: string,
  market: PublicMarket,
  extraParams?: Record<string, string | null | undefined>
): string {
  const parsed = new URL(addMarketQueryParam(href, market), 'https://app.local');
  for (const [key, value] of Object.entries(extraParams || {})) {
    if (!value) continue;
    parsed.searchParams.set(key, value);
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
