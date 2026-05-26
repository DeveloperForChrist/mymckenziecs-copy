import type { Metadata } from 'next';
import { Suspense } from 'react';
import PricingPageClient from '@/components/pricing/PricingPageClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Litigant Pricing Plans',
  description:
    'Compare MyMcKenzieCS plans for litigants in person who need document organisation, deadline reminders, research support, and case preparation tools.',
  path: '/pricing/litigants',
});

export const revalidate = 86400;

export default function LitigantsPricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageClient
        audienceDescription="Founding-member offer for early members. Compare plans for litigants in person who need help organising documents, tracking deadlines, keeping notes, and preparing their own case with structured support."
        availabilityMessage="Founding-member launch offer: 25% off for early members, with a 3-day free trial before billing starts."
        guideIntroText="If you are managing your own UK matter, start with the"
        priceByPlan={{
          basic: '14',
          premium: '24',
          premiumPlus: '149',
        }}
      />
    </Suspense>
  );
}
