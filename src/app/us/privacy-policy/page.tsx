import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Privacy Policy',
  description:
    'Review how MyMcKenzieCS handles account, billing, document, and usage data for the U.S. version of the platform.',
  path: '/us/privacy-policy',
});

export const revalidate = 86400;

export default function UsPrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="U.S. Privacy Policy"
      subtitle="How we collect, use, store, and protect data for the U.S.-facing version of MyMcKenzieCS."
      meta="Owned by Lenjordan Ltd • Updated 20 April 2026"
    >
      <ol className="list-decimal pl-6 space-y-6 text-base md:text-lg">
        <li>
          <b>Introduction</b>
          <p className="mt-2">
            This Privacy Policy explains how MyMcKenzieCS handles personal data when you use the U.S.-facing version of the platform. MyMcKenzieCS is operated by Lenjordan Ltd.
          </p>
          <p>
            The platform is a case support workspace for legal support professionals and self-represented users. It is not a law firm, and it does not provide legal advice.
          </p>
        </li>
        <li>
          <b>Data We Collect</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Account information such as name, email address, password-authentication data, and profile details</li>
            <li>Jurisdiction details such as country, state, district, or similar legal-matter context you provide</li>
            <li>Subscription and billing metadata such as plan, renewal status, Stripe customer/subscription identifiers, and limited payment-method metadata where available</li>
            <li>Documents, notes, case summaries, and other materials you upload or save in the workspace</li>
            <li>AI interaction content such as prompts, messages, generated drafts, and assistant context used to deliver product features</li>
            <li>Technical and usage data such as IP address, browser information, device/session details, page activity, and error logs</li>
          </ul>
        </li>
        <li>
          <b>How We Use Data</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Provide the workspace, account features, and paid-plan access</li>
            <li>Generate AI-assisted summaries, drafting support, and procedural guidance</li>
            <li>Process billing, trials, renewals, reminder emails, and account-lifecycle notices</li>
            <li>Maintain security, prevent fraud or abuse, and investigate service issues</li>
            <li>Improve reliability, usability, and feature quality over time</li>
            <li>Comply with legal, regulatory, and platform-security obligations</li>
          </ul>
          <p className="mt-2">
            We do not sell your data for advertising or share it with third parties for their marketing.
          </p>
        </li>
        <li>
          <b>Service Providers and Infrastructure</b>
          <p className="mt-2">
            We use service providers to operate the platform, including hosting, authentication, storage, payment processing, email delivery, and AI model providers.
          </p>
          <p>
            These providers process data only as needed to support the service. Examples include infrastructure vendors, Stripe for payments, and email or AI providers involved in delivering platform features.
          </p>
        </li>
        <li>
          <b>Cross-Border Processing</b>
          <p className="mt-2">
            MyMcKenzieCS is operated by a UK company, and our infrastructure providers may process data inside or outside the United States. Depending on the service involved, data may also be processed inside or outside the UK/EU.
          </p>
          <p>
            Where cross-border transfers occur, we use contractual, technical, and organizational safeguards designed to protect the data being processed.
          </p>
        </li>
        <li>
          <b>Privacy Framework and User Rights</b>
          <p className="mt-2">
            Because the platform is operated by Lenjordan Ltd, some of our internal privacy compliance obligations are structured around UK data-protection law. Depending on where you live, you may also have additional privacy rights under applicable U.S. state law.
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Request access to personal data we hold about you</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion where appropriate</li>
            <li>Object to or restrict certain processing where applicable</li>
            <li>Ask questions about how data is used, stored, or transferred</li>
          </ul>
        </li>
        <li>
          <b>Data Retention</b>
          <p className="mt-2">
            We keep account and workspace data while your account remains active and for a reasonable period afterward to operate billing, retention, archive, and deletion workflows.
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Paid-plan lifecycle notices may be sent before read-only, archive, or deletion milestones</li>
            <li>Billing failures may trigger grace periods, reminders, and access restrictions</li>
            <li>Backups and security logs may persist briefly after account changes or deletion requests</li>
          </ul>
        </li>
        <li>
          <b>Cookies and Browser Storage</b>
          <p className="mt-2">
            We use cookies and similar browser technologies for authentication, security, session continuity, optional analytics, and product preferences. See the separate U.S. Cookie Policy for more detail.
          </p>
        </li>
        <li>
          <b>Children</b>
          <p className="mt-2">
            The platform is not intended for children under 18, and we do not knowingly collect personal data from minors.
          </p>
        </li>
        <li>
          <b>Changes to This Policy</b>
          <p className="mt-2">
            We may update this policy from time to time. The updated version will be posted here with a revised date.
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
