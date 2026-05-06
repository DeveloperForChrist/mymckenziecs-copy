import type { Metadata } from 'next';
import { Suspense } from 'react';
import PricingPageClient from '@/components/pricing/PricingPageClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Pricing Plans',
  description:
    'Compare MyMcKenzieCS Basic, Premium, and Premium + plans for McKenzie Friends, legal support professionals, and the clients they support.',
  path: '/pricing',
});
export const revalidate = 86400;

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageClient />
    </Suspense>
  );
}
