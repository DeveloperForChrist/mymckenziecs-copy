import type { Metadata } from 'next';
import CookiePreferencesSection from '@/components/settings/CookiePreferencesSection';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Cookie Policy',
  description:
    'Learn how MyMcKenzieCS uses cookies, browser storage, and similar technologies on the U.S.-facing version of the site and app.',
  path: '/us/cookie-policy',
});

export const revalidate = 86400;
const googleAnalyticsMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

export default function UsCookiePolicyPage() {
  return (
    <LegalPageLayout
      title="U.S. Cookie Policy"
      subtitle="How cookies and browser storage support security, authentication, analytics, and product continuity."
      meta="Owned by Lenjordan Ltd • Updated 20 April 2026"
    >
      <ol className="list-decimal pl-6 space-y-6 text-base md:text-lg">
        <li>
          <b>Introduction</b>
          <p className="mt-2">
            This Cookie Policy explains how MyMcKenzieCS uses cookies and similar browser technologies on the U.S.-facing version of the website and web application.
          </p>
        </li>
        <li>
          <b>What We Use Cookies and Storage For</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Signing you in and maintaining your authenticated session</li>
            <li>Protecting the platform from fraud, abuse, and unauthorized access</li>
            <li>Remembering interface and product preferences</li>
            <li>Supporting optional analytics where consent is required</li>
            <li>Preserving limited continuity for notes, workflow state, and similar app features</li>
          </ul>
        </li>
        <li>
          <b>Types of Technologies We May Use</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Essential cookies for authentication and security</li>
            <li>Session cookies that expire when the browser session ends</li>
            <li>Persistent cookies for saved preferences and similar settings</li>
            <li>Local storage or session storage for app continuity and UI state</li>
          </ul>
        </li>
        <li>
          <b>Third-Party Providers</b>
          <p className="mt-2">
            Some integrated providers may also rely on cookies or related browser technologies, including payment providers, analytics providers when enabled, and other infrastructure services needed to run the platform.
          </p>
        </li>
        <li>
          <b>Your Choices</b>
          <p className="mt-2">
            You can manage cookies through your browser settings and, where available, through the product controls on this page. Blocking essential cookies may stop the platform from functioning properly.
          </p>
          <div className="mt-4">
            <CookiePreferencesSection measurementId={googleAnalyticsMeasurementId} />
          </div>
        </li>
        <li>
          <b>Changes to This Policy</b>
          <p className="mt-2">
            We may update this Cookie Policy from time to time. The current version will be published on this page.
          </p>
        </li>
        <li>
          <b>Contact</b>
          <p className="mt-2">
            Lenjordan Ltd
            <br />
            Email: jordan@lenjordan.tech
            <br />
            Registered Office: 66 Chamberlain Way, Pinner HA5 2AT
          </p>
        </li>
      </ol>
    </LegalPageLayout>
  );
}
