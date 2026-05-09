import type { Metadata } from 'next';
import PricingAudienceSelector from '@/components/pricing/PricingAudienceSelector';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Pricing Plans',
  description:
    'Choose MyMcKenzieCS pricing for litigants in person or business workspaces for legal support providers.',
  path: '/pricing',
});
export const revalidate = 86400;

export default function PricingPage() {
  return <PricingAudienceSelector homeHref="/" regionLabel="UK pricing" />;
}
