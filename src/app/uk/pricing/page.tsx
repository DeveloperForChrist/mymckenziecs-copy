import type { Metadata } from 'next';
import { Suspense } from 'react';
import PricingPageClient from '@/components/pricing/PricingPageClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Pricing Plans',
  description:
    'Choose MyMcKenzieCS UK pricing for litigants in person or business workspaces for legal support providers.',
  path: '/uk/pricing',
});
export const revalidate = 86400;

export default function UkPricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageClient
        priceByPlan={{
          basic: '18',
          premium: '32',
          premiumPlus: '149',
        }}
      />
    </Suspense>
  );
}
