import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import UkCookiePolicyContent from '@/components/legal/UkCookiePolicyContent';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Cookie Policy',
  description:
    'Learn how MyMcKenzieCS uses essential cookies, analytics cookies, and local storage across the website and web app.',
  path: '/cookie-policy',
});

export const revalidate = 86400;
const googleAnalyticsMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()

export default function CookiePolicyPage() {
  return (
    <LegalPageLayout
      title="Cookie Policy"
      subtitle="How we use cookies and local storage to keep the platform secure."
      meta="Owned by Lenjordan Ltd • Last Updated: June 19, 2026"
    >
      <UkCookiePolicyContent measurementId={googleAnalyticsMeasurementId} />
    </LegalPageLayout>
  );
}
