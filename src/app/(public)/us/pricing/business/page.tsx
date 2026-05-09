import type { Metadata } from 'next';
import BusinessPricingPage from '@/components/pricing/BusinessPricingPageAligned';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Business Pricing Plans',
  description:
    'Compare MyMcKenzieCS Solo, Team, and Enterprise pricing plans for U.S. legal support businesses managing client matters.',
  path: '/us/pricing/business',
});

export const revalidate = 86400;

export default function UsBusinessPricingRoute() {
  return (
    <BusinessPricingPage
      marketPrefix="/us"
      homeHref="/us"
      currencySymbol="$"
      prices={{ solo: '69', team: '199', enterprise: 'Custom' }}
      regionNote="U.S. business plans are for legal support businesses and teams that need shared client-workspace tools while U.S. coverage continues expanding."
    />
  );
}
