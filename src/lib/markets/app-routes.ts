import type { PublicMarket } from '@/lib/markets/public-routes';

export type AppMarket = PublicMarket;

const EXACT_APP_ROUTE_BY_MARKET: Record<AppMarket, Record<string, string>> = {
  GB: {
    '/dashboard': '/dashboard',
    '/dashboard/calendar': '/dashboard/calendar',
    '/dashboard/documents': '/dashboard/documents',
    '/dashboard/MyNotes': '/dashboard/MyNotes',
    '/dashboard/mynotes': '/dashboard/MyNotes',
    '/dashboard/case-law-search': '/dashboard/case-law-search',
    '/settings': '/settings',
    '/chatbot': '/chatbot',
    '/checkout/success': '/checkout/success',
    '/workspace': '/workspace',
  },
  US: {
    '/dashboard': '/us/dashboard',
    '/dashboard/calendar': '/us/dashboard/calendar',
    '/dashboard/documents': '/us/dashboard/documents',
    '/dashboard/MyNotes': '/us/dashboard/MyNotes',
    '/dashboard/mynotes': '/us/dashboard/MyNotes',
    '/dashboard/case-law-search': '/us/dashboard/case-law-search',
    '/settings': '/us/settings',
    '/chatbot': '/us/chatbot',
    '/checkout/success': '/us/checkout/success',
    '/workspace': '/us/workspace',
  },
};

export function getAppMarketFromPathname(pathname?: string | null): AppMarket {
  return String(pathname || '').startsWith('/us') ? 'US' : 'GB';
}

export function getAppRouteForMarket(path: string, market: AppMarket): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const parsed = new URL(normalizedPath, 'https://app.local');
  const mappedPath = EXACT_APP_ROUTE_BY_MARKET[market][parsed.pathname] || parsed.pathname;
  return `${mappedPath}${parsed.search}${parsed.hash}`;
}
