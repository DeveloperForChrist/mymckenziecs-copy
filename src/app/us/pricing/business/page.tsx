import type { Metadata } from 'next';
import BusinessPricingPage from '@/components/pricing/BusinessPricingPageAligned';
import { buildPageMetadata } from '@/lib/seo';
import { getBusinessSoloIntroPriceId } from '@/constants';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Business Pricing Plan',
  description:
    'MyMcKenzieCS Solo pricing for U.S. legal support professionals managing client matters.',
  path: '/us/pricing/business',
});

export const revalidate = 86400;

export default function UsBusinessPricingRoute() {
  return (
    <BusinessPricingPage
      marketPrefix="/us"
      homeHref="/us"
      currencySymbol="$"
      prices={{ intro: '29.99', standard: '39.99' }}
      soloPriceId={getBusinessSoloIntroPriceId('US')}
      regionNote="U.S. Solo business plan for independent legal support professionals while U.S. coverage continues expanding."
    />
  );
}
