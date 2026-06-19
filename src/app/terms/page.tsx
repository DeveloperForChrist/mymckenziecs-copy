import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import UkTermsContent from '@/components/legal/UkTermsContent';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Terms and Conditions',
  description:
    'Read the MyMcKenzieCS terms and conditions covering platform access, subscriptions, responsibilities, and service limitations.',
  path: '/terms',
});

export const revalidate = 86400;

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms & Conditions"
      subtitle="Clear rules for using the platform and keeping your case data safe."
      meta="Owned by Lenjordan Ltd • Last Updated: June 19, 2026"
    >
      <UkTermsContent />
    </LegalPageLayout>
  );
}
