import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';
import { redirect } from 'next/navigation';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Pricing Plans',
  description:
    'Compare MyMcKenzieCS U.S. pricing for self-represented litigants.',
  path: '/us/pricing/litigants',
});

export const revalidate = 86400;

export default function UsLitigantsPricingPage() {
  redirect('/us/pricing');
}
