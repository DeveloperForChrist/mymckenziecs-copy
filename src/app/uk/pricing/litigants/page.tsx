import type { Metadata } from 'next';
import { Suspense } from 'react';
import PricingPageClient from '@/components/pricing/PricingPageClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'UK Litigant Pricing Plans',
  description:
    'Compare MyMcKenzieCS plans for UK litigants in person who need document organisation, deadline reminders, research support, and case preparation tools.',
  path: '/uk/pricing/litigants',
});

export const revalidate = 86400;

export default function UkLitigantsPricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageClient
        billingMarket="GB"
        audienceDescription="Founding-member offer for early members. Compare plans for UK litigants in person who need help organising documents, tracking deadlines, keeping notes, and preparing their own case with structured support."
        availabilityMessage="Founding-member launch offer: 25% off for early members, with a 3-day free trial before billing starts."
        faqHref="/uk/faq"
        guideIntroText="If you are managing your own UK matter, start with the"
        priceByPlan={{
          basic: '14',
          premium: '24',
          premiumPlus: '149',
        }}
        guideLinks={[
          { href: '/uk/litigant-in-person-uk', label: 'UK self-representation guide' },
          { href: '/uk/organise-court-documents-uk', label: 'document organisation guide' },
          { href: '/uk/case-law-search-uk', label: 'case-law search guide' },
        ]}
      />
    </Suspense>
  );
}
