import type { Metadata } from 'next';
import BusinessPricingPage from '@/components/pricing/BusinessPricingPageAligned';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'UK Business Pricing Plans',
  description:
    'Compare MyMcKenzieCS Solo, Team, and Enterprise pricing plans for UK legal support businesses managing client matters.',
  path: '/uk/pricing/business',
});

export const revalidate = 86400;

export default function UkBusinessPricingRoute() {
  return (
    <BusinessPricingPage
      marketPrefix="/uk"
      homeHref="/uk"
      currencySymbol="£"
      prices={{ solo: '49', team: '149', enterprise: 'Custom' }}
      regionNote="UK business plans are for McKenzie Friends, paralegals, document-preparation providers, and legal support teams serving client matters."
    />
  );
}
