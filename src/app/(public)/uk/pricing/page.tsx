import type { Metadata } from 'next';
import PricingAudienceSelector from '@/components/pricing/PricingAudienceSelector';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Pricing Plans',
  description:
    'Choose MyMcKenzieCS UK pricing for litigants in person or business workspaces for legal support providers.',
  path: '/uk/pricing',
});
export const revalidate = 86400;

export default function UkPricingPage() {
  return <PricingAudienceSelector marketPrefix="/uk" homeHref="/uk" regionLabel="UK pricing" />;
}
