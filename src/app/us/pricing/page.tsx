import type { Metadata } from 'next';
import { Suspense } from 'react';
import PricingPageClient from '@/components/pricing/PricingPageClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Pricing Plans',
  description:
    'Compare MyMcKenzieCS U.S. pricing for self-represented litigants who need document organisation, deadline reminders, research support, and case preparation tools.',
  path: '/us/pricing',
});
export const revalidate = 86400;

export default function UsPricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageClient
        audienceDescription="Compare plans for U.S. self-represented litigants who need help organising documents, tracking deadlines, keeping notes, and preparing their own case while U.S. coverage continues to expand."
        availabilityMessage="U.S. self-representation support is live across the shared workspace. Coming soon: advanced U.S. case-law database access and expanded authority coverage."
        guideIntroText="If you are managing your own U.S. matter, start with the"
        faqHref="/us/faq"
        billingMarket="US"
        currencySymbol="$"
        priceByPlan={{
          basic: '25',
          premium: '44',
          premiumPlus: '270',
        }}
        guideLinks={[
          { href: '/us/self-represented-litigant-guide', label: 'U.S. self-represented litigant guide' },
          { href: '/us/organize-court-documents', label: 'document organisation guide' },
          { href: '/us/case-law-research', label: 'U.S. case-law research guide' },
        ]}
      />
    </Suspense>
  );
}
