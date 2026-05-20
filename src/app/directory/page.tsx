import type { Metadata } from 'next';
import DirectoryClient from '@/components/directory/DirectoryClient';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Find Legal Professionals',
  description: 'Browse our directory of McKenzie Friends, paralegals, and legal consultants to find the right professional for your case.',
  path: '/directory',
});

export default function PublicDirectoryPage() {
  return <DirectoryClient mode="litigant" />;
}
