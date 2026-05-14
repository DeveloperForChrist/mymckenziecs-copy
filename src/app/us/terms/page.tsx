import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Terms and Conditions',
  description:
    'Read the U.S.-facing MyMcKenzieCS terms covering access, subscriptions, responsibilities, and service limits.',
  path: '/us/terms',
});

export const revalidate = 86400;

export default function UsTermsPage() {
  return (
    <LegalPageLayout
      title="U.S. Terms & Conditions"
      subtitle="The core rules for using the U.S.-facing version of the shared MyMcKenzieCS platform."
      meta="Owned by Lenjordan Ltd • Updated 20 April 2026"
    >
      <ol className="list-decimal pl-6 space-y-6 text-base md:text-lg">
        <li>
          <b>Introduction</b>
          <p className="mt-2">
            These Terms govern your use of the U.S.-facing version of MyMcKenzieCS, operated by Lenjordan Ltd.
          </p>
          <p>
            By creating an account, using the platform, or purchasing a subscription, you agree to these Terms and the applicable privacy/cookie policies.
          </p>
        </li>
        <li>
          <b>Nature of the Service</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>MyMcKenzieCS is a digital case support workspace for legal support professionals and self-represented users</li>
            <li>It provides organizational, procedural, practice-support, and AI-assisted support</li>
            <li>It is not a law firm and does not provide legal advice, legal representation, or courtroom advocacy</li>
            <li>You remain responsible for all filings, deadlines, strategy, evidence decisions, and compliance with local court rules</li>
          </ul>
        </li>
        <li>
          <b>Eligibility</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>You must be at least 18 years old</li>
            <li>You must provide accurate registration information</li>
            <li>You must have the right to upload and process the material you place in the workspace</li>
            <li>You must use the platform lawfully and in line with these Terms</li>
          </ul>
        </li>
        <li>
          <b>U.S. Coverage Limitations</b>
          <p className="mt-2">
            The U.S. version uses the same shared workspace as the original platform, but U.S. jurisdiction coverage is still expanding.
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>State, federal, and local procedure can vary significantly</li>
            <li>Not every feature is available for every U.S. jurisdiction</li>
            <li>Advanced U.S. case-law database depth is still limited compared with the UK-only tools already in place</li>
          </ul>
        </li>
        <li>
          <b>User Responsibilities</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Review all AI-generated output before relying on it</li>
            <li>Check local court forms, deadlines, service requirements, and filing rules independently</li>
            <li>Keep your login credentials secure</li>
            <li>Do not misuse, scrape, attack, or interfere with the platform</li>
            <li>Do not upload unlawful, malicious, or unauthorized material</li>
          </ul>
        </li>
        <li>
          <b>Billing and Subscriptions</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Paid plans renew automatically until canceled</li>
            <li>Prices shown on the relevant market pages apply to your subscription path</li>
            <li>Failed payments may trigger retries, grace periods, billing reminders, or access restrictions</li>
            <li>Read-only, archive, and deletion lifecycle steps may apply after long-term lapse, subject to notices sent to your account email</li>
          </ul>
        </li>
        <li>
          <b>Refunds</b>
          <p className="mt-2">
            Refunds are generally limited to cases where a paid service failed to function as described and we could not correct the issue. Refunds are not based on case outcomes or disagreement with AI output.
          </p>
        </li>
        <li>
          <b>Privacy and Data</b>
          <p className="mt-2">
            Your use of the platform is also governed by the applicable privacy and cookie policies. You retain ownership of your uploaded case material, while granting us the rights needed to process it for platform operation and feature delivery.
          </p>
        </li>
        <li>
          <b>Intellectual Property</b>
          <p className="mt-2">
            The MyMcKenzieCS platform, branding, software, and product workflows belong to Lenjordan Ltd. You may not reverse-engineer, resell, or copy the platform itself.
          </p>
        </li>
        <li>
          <b>Limitation of Liability</b>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>We are not liable for court outcomes, missed deadlines, rejected filings, or legal losses</li>
            <li>The platform is informational and organizational only</li>
            <li>To the extent allowed by law, our liability is limited to the amount you paid us in the prior 30 days</li>
          </ul>
        </li>
        <li>
          <b>Availability and Changes</b>
          <p className="mt-2">
            We may change, suspend, improve, or remove features at any time. We do not guarantee uninterrupted availability.
          </p>
        </li>
        <li>
          <b>Account Restriction or Termination</b>
          <p className="mt-2">
            We may suspend or terminate access for misuse, fraud, unlawful content, payment abuse, major policy violations, or other risk to the platform or other users.
          </p>
        </li>
        <li>
          <b>Governing Law</b>
          <p className="mt-2">
            Unless mandatory consumer law in your place of residence requires otherwise, these Terms are governed by the laws of England and Wales.
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
