import type { Metadata } from 'next';
import BusinessPricingPage from '@/components/pricing/BusinessPricingPageAligned';
import { buildPageMetadata } from '@/lib/seo';
import { getBusinessSoloIntroPriceId } from '@/constants';

export const metadata: Metadata = buildPageMetadata({
  title: 'Business Pricing Plan',
  description:
    'MyMcKenzieCS Solo pricing for legal support professionals managing client matters.',
  path: '/pricing/business',
});

export const revalidate = 86400;

export default function BusinessPricingRoute() {
  return (
    <BusinessPricingPage
      homeHref="/"
      currencySymbol="£"
      prices={{ intro: '29.99', standard: '39.99' }}
      soloPriceId={getBusinessSoloIntroPriceId('GB')}
      regionNote="Solo business plan for independent legal support professionals."
    />
  );
}
