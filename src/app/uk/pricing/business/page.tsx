import type { Metadata } from 'next';
import BusinessPricingPage from '@/components/pricing/BusinessPricingPageAligned';
import { buildPageMetadata } from '@/lib/seo';
import { getBusinessSoloIntroPriceId } from '@/constants';

export const metadata: Metadata = buildPageMetadata({
  title: 'UK Business Pricing Plan',
  description:
    'MyMcKenzieCS Solo pricing for UK legal support professionals managing client matters.',
  path: '/uk/pricing/business',
});

export const revalidate = 86400;

export default function UkBusinessPricingRoute() {
  return (
    <BusinessPricingPage
      marketPrefix="/uk"
      homeHref="/uk"
      currencySymbol="£"
      price="29.99"
      soloPriceId={getBusinessSoloIntroPriceId('GB')}
      regionNote="UK Solo business plan for independent legal support providers managing client matters."
    />
  );
}
