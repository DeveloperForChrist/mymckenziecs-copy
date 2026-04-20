import type { SupportedCountryCode } from '@/lib/legal/jurisdictions';

export type PublicMarket = Extract<SupportedCountryCode, 'GB' | 'US'>;

const EXACT_ROUTE_BY_MARKET: Record<PublicMarket, Record<string, string>> = {
  GB: {
    '/': '/',
    '/about': '/about',
    '/pricing': '/pricing',
    '/faq': '/faq',
    '/help': '/help',
    '/privacy-policy': '/privacy-policy',
    '/terms': '/terms',
    '/cookie-policy': '/cookie-policy',
    '/contact': '/contact',
    '/legal-case-management-tool': '/legal-case-management-tool',
    '/litigant-in-person-uk': '/litigant-in-person-uk',
    '/how-to-prepare-small-claims-court-uk': '/how-to-prepare-small-claims-court-uk',
    '/small-claims-court-uk': '/small-claims-court-uk',
    '/organise-court-documents-uk': '/organise-court-documents-uk',
    '/court-bundle-preparation-uk': '/court-bundle-preparation-uk',
    '/case-law-search-uk': '/case-law-search-uk',
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
