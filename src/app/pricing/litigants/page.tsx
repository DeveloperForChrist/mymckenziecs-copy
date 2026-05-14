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
        audienceDescription="Compare plans for litigants in person who need help organising documents, tracking deadlines, keeping notes, and preparing their own case with structured support."
        guideIntroText="If you are managing your own UK matter, start with the"
      />
    </Suspense>
  );
}
