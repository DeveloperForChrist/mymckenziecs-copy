import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
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
      meta="Owned by Lenjordan Ltd • Last Updated: March 10, 2026"
    >
      <ol className="list-decimal pl-6 space-y-6 text-base md:text-lg">
        <li>
          <b>Introduction</b>
          <p className="mt-2">This Privacy Policy explains how MyMcKenzieCS, owned and operated by Lenjordan Ltd, collects, uses, stores, and protects your personal data under the Data Protection Act 2018 and the UK GDPR.</p>
          <p>By using the Platform, you agree to the practices described in this policy.</p>
          <p>We are not a law firm, and we do not provide legal advice. We are a legal-tech service that supports Litigants in Person with AI-generated tools.</p>
        </li>
        <li>
          <b>Data We Collect</b>
          <p className="mt-2">We only collect information necessary to provide and improve our services.</p>
          <ol className="list-decimal pl-6 mt-2 space-y-2">
            <li>
              <b>Personal Information</b>
              <ul className="list-disc pl-6 mt-1">
                <li>Name</li>
                <li>Email address</li>
                <li>Account login information</li>
                <li>Subscription and billing metadata (for example, plan name, billing status, renewal dates, Stripe customer/subscription identifiers)</li>
                <li>Limited payment method metadata where available (for example, card brand and last four digits via Stripe)</li>
              </ul>
            </li>
            <li>
              <b>Case Information</b>
              <ul className="list-disc pl-6 mt-1">
                <li>Documents you upload (evidence, statements, court forms, letters, etc.)</li>
                <li>Notes and details you add to your dashboard</li>
                <li>Case summaries and preparation materials</li>
              </ul>
            </li>
            <li>
              <b>AI Interaction Data</b>
              <ul className="list-disc pl-6 mt-1">
                <li>Chat messages</li>
                <li>Document drafts</li>
                <li>Queries submitted to the AI</li>
              </ul>
            </li>
            <li>
              <b>Technical &amp; Usage Data</b>
              <ul className="list-disc pl-6 mt-1">
                <li>IP address</li>
                <li>Device and browser information</li>
                <li>Session logs</li>
                <li>Pages visited</li>
                <li>Error logs</li>
              </ul>
            </li>
          </ol>
        </li>
        <li>
          <b>How We Use Your Data</b>
          <ul className="list-disc pl-6 mt-2">
            <li>Operating the Platform</li>
            <li>Generating AI-driven guidance and documents</li>
            <li>Analysing uploaded documents</li>
            <li>Providing customer support</li>
            <li>Improving functionality and features</li>
            <li>Ensuring security and preventing misuse</li>
            <li>Enforcing access rules based on subscription status (including read-only controls after lapse)</li>
            <li>Sending operational account and billing notices (verification, payment reminders, hard-lock/deletion warnings)</li>
            <li>Fulfilling legal or regulatory obligations</li>
          </ul>
          <p className="mt-2">We do not use your data for advertising. We do not sell or transfer your data to third parties for marketing.</p>
        </li>
        <li>
          <b>Data Storage &amp; Security</b>
          <p className="mt-2">All data is stored securely using cloud infrastructure providers.</p>
          <b className="block mt-2">Security Measures</b>
          <ul className="list-disc pl-6 mt-1">
            <li>Encrypted storage</li>
            <li>Encrypted file transfers</li>
            <li>Secure authentication</li>
            <li>Access control rules</li>
            <li>Monitoring and auditing tools</li>
          </ul>
          <p className="mt-2">We apply additional restrictions via server-side security rules, role-based access, and document-level protection.</p>
          <b className="block mt-2">Hosting Location</b>
          <p>Our infrastructure providers may process data in secure data centres located inside and outside the UK/EU. Where data leaves the UK/EU, we ensure GDPR-approved safeguards, including:</p>
          <ul className="list-disc pl-6 mt-1">
            <li>Standard Contractual Clauses (SCCs)</li>
            <li>Data minimisation policies</li>
            <li>Encryption</li>
          </ul>
        </li>
        <li>
          <b>Legal Basis for Processing</b>
          <ul className="list-disc pl-6 mt-2">
            <li>Contractual necessity – to provide the features you signed up for</li>
            <li>Legitimate interests – ensuring security, preventing abuse, improving the service</li>
            <li>Consent – analytics or optional features</li>
            <li>Legal obligation – preventing fraud or complying with regulation</li>
          </ul>
        </li>
        <li>
          <b>Sharing Your Data</b>
          <p className="mt-2">Your data may be shared only with:</p>
          <b className="block mt-2">Infrastructure Providers</b>
          <ul className="list-disc pl-6 mt-1">
            <li>Cloud infrastructure providers (hosting, authentication, database, storage)</li>
            <li>Stripe (payments)</li>
            <li>Email service providers</li>
            <li>AI model providers used to generate assistant responses</li>
          </ul>
          <p className="mt-2">All act as data processors under GDPR.</p>
          <b className="block mt-2">No Legal Adviser Access</b>
          <p>We do not share your data with solicitors, barristers, or legal representatives.</p>
          <b className="block mt-2">If Required by Law</b>
          <ul className="list-disc pl-6 mt-1">
            <li>Under a court order</li>
            <li>To law enforcement where legally required</li>
            <li>To comply with regulatory obligations</li>
          </ul>
          <p className="mt-2">We never disclose data voluntarily to third parties for non-legal reasons.</p>
        </li>
        <li>
          <b>Automated Access &amp; Billing Decisions</b>
          <p className="mt-2">Some account actions are automated, including entitlement checks, subscription status checks, and read-only/lifecycle gating based on billing state.</p>
          <ul className="list-disc pl-6 mt-2">
            <li>These checks help us deliver the contract, prevent misuse, and apply account rules consistently.</li>
            <li>If you believe an automated account state is wrong, contact support to request review.</li>
          </ul>
        </li>
        <li>
          <b>Your Rights Under UK GDPR</b>
          <ul className="list-disc pl-6 mt-2">
            <li>Access your personal data</li>
            <li>Request correction</li>
            <li>Request deletion</li>
            <li>Restrict processing</li>
            <li>Data portability</li>
            <li>Object to certain processing</li>
            <li>Withdraw consent</li>
            <li>You may also complain to the Information Commissioner’s Office (ICO).</li>
          </ul>
        </li>
        <li>
          <b>Cookies</b>
          <ul className="list-disc pl-6 mt-2">
            <li>Authentication</li>
            <li>Session management</li>
            <li>Security</li>
            <li>Analytics (optional, only after consent)</li>
          </ul>
          <p className="mt-2">You may disable cookies in your browser, but the Platform may not function correctly. A separate Cookie Policy will provide full details.</p>
        </li>
        <li>
          <b>Data Retention</b>
          <ul className="list-disc pl-6 mt-2">
            <li>Your account data is kept while your account is active</li>
            <li>Failed renewals may enter a grace phase (typically up to 5 days, or as stated in billing notices) with billing reminders</li>
            <li>After lapse, account features may move to read-only until billing is resumed</li>
            <li>Hard-lock/archive phase may apply around day 30 from lapse, with warning notices sent before the milestone</li>
            <li>Deletion phase may apply around day 90 from lapse, with warning notices sent before the milestone</li>
            <li>You can resume a paid plan before deletion deadlines to restore normal access</li>
            <li>Backups may persist briefly</li>
            <li>If your account is deleted, associated data is removed unless legally required otherwise</li>
          </ul>
          <p className="mt-2">Where timelines are updated, we will reflect this in product notices and policy updates.</p>
        </li>
        <li>
          <b>Browser Storage</b>
          <p className="mt-2">To improve reliability and continuity, we may store limited account-related data in browser storage (such as draft notes and dismissed notification preferences).</p>
          <ul className="list-disc pl-6 mt-2">
            <li>This data is tied to your browser session/profile and can be cleared in browser settings.</li>
            <li>Browser storage is used for product functionality, not ad tracking.</li>
          </ul>
        </li>
        <li>
          <b>Children’s Data</b>
          <p className="mt-2">The Platform is not intended for individuals under 18. We do not knowingly collect data from minors.</p>
        </li>
        <li>
          <b>External Links</b>
          <p className="mt-2">We are not responsible for the privacy practices of external websites linked from the Platform.</p>
        </li>
        <li>
          <b>Changes to This Policy</b>
          <p className="mt-2">We may update this Privacy Policy at any time. A new revision date will appear at the top of this page. Continued use of the Platform means you accept the changes.</p>
        </li>
        <li>
          <b>Contact Information</b>
          <p className="mt-2">Lenjordan Ltd<br/>Email: jordan@lenjordan.tech<br/>Registered Office: 66 Chamberlain Way, Pinner HA5 2AT<br/>Data Protection Contact: jordan@lenjordan.tech</p>
        </li>
      </ol>
    </LegalPageLayout>
  );
}
