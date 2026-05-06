import type { Metadata } from 'next';
import { Suspense } from 'react';
import PricingPageClient from '@/components/pricing/PricingPageClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Pricing Plans',
  description:
    'Compare MyMcKenzieCS Basic, Premium, and Premium + plans for U.S. legal support professionals and self-represented users, including document tools, deadline reminders, and growing U.S. research support.',
  path: '/us/pricing',
});
export const revalidate = 86400;

export default function UsPricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingPageClient
        audienceDescription="Compare plans for U.S. legal support professionals and self-represented users, then start with the option that fits your workload while U.S. coverage continues to expand."
        availabilityMessage="U.S. self-representation support is live across the shared workspace. Coming soon: advanced U.S. case-law database access and expanded authority coverage."
        guideIntroText="If you support a U.S. matter, start with the"
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
          { href: '/us/small-claims-court-guide', label: 'U.S. small claims court guide' },
          { href: '/us/case-law-research', label: 'U.S. case-law research guide' },
        ]}
      />
    </Suspense>
  );
}
