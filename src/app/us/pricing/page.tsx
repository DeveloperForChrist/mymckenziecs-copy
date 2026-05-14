import type { Metadata } from 'next';
import PricingAudienceSelector from '@/components/pricing/PricingAudienceSelector';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Pricing Plans',
  description:
    'Choose MyMcKenzieCS U.S. pricing for self-represented litigants or business workspaces for legal support providers.',
  path: '/us/pricing',
});
export const revalidate = 86400;

export default function UsPricingPage() {
  return <PricingAudienceSelector marketPrefix="/us" homeHref="/us" regionLabel="U.S. pricing" />;
}
