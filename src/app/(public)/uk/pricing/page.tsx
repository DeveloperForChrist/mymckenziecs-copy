import type { Metadata } from 'next';
import { Suspense } from 'react';
import PricingPageClient from '@/components/pricing/PricingPageClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Pricing Plans',
  description:
    'Compare MyMcKenzieCS Basic, Premium, and Premium + plans for UK McKenzie Friends, legal support professionals, and the clients they support.',
  path: '/uk/pricing',
});
export const revalidate = 86400;

export default function UkPricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageClient
        billingMarket="GB"
        faqHref="/uk/faq"
        guideLinks={[
          { href: '/uk/litigant-in-person-uk', label: 'UK self-representation guide' },
          { href: '/uk/mckenzie-friend-support', label: 'McKenzie friend support guide' },
          { href: '/uk/case-law-search-uk', label: 'case-law search guide' },
        ]}
      />
    </Suspense>
  );
}
