import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import UkPrivacyPolicyContent from '@/components/legal/UkPrivacyPolicyContent';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description:
    'Review how MyMcKenzieCS collects, uses, stores, and protects personal data under UK GDPR.',
  path: '/privacy-policy',
});

export const revalidate = 86400;

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      subtitle="How we collect, use, and protect your information under UK GDPR."
      meta="Owned by Lenjordan Ltd • Last Updated: June 19, 2026"
    >
      <UkPrivacyPolicyContent />
    </LegalPageLayout>
  );
}
