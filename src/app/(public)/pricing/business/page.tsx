import type { Metadata } from 'next';
import BusinessPricingPage from '@/components/pricing/BusinessPricingPageAligned';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Business Pricing Plans',
  description:
    'Compare MyMcKenzieCS Solo, Team, and Enterprise pricing plans for legal support businesses managing client matters.',
  path: '/pricing/business',
});

export const revalidate = 86400;

export default function BusinessPricingRoute() {
  return (
    <BusinessPricingPage
      homeHref="/"
      currencySymbol="£"
      prices={{ solo: '49', team: '149', enterprise: 'Custom' }}
      regionNote="Business plans are designed for legal support providers and operational teams. Pricing can be refined before Stripe checkout is connected for these business tiers."
    />
  );
}
