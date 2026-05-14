import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Contact',
  description:
    'Contact the MyMcKenzieCS team for U.S. rollout support, billing questions, account help, or privacy requests.',
  path: '/us/contact',
});

export const revalidate = 86400;

export default function UsContactPage() {
  return (
    <LegalPageLayout
      title="U.S. Contact"
      subtitle="Reach the MyMcKenzieCS team for U.S. rollout support, billing questions, or account help."
      meta="Support handled by Lenjordan Ltd • Replies typically within 1-3 business days"
    >
      <div className="space-y-8 text-base md:text-lg">
        <section>
          <h2 className="text-2xl font-semibold mb-2">Primary contact</h2>
          <p>
            Email:{' '}
            <a href="mailto:jordan@lenjordan.tech" className="text-blue-600 hover:underline">
              jordan@lenjordan.tech
            </a>
          </p>
          <p className="mt-2">
            Tell us that you are using the U.S. version and include the state, federal, or local court context if that matters to the question.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold mb-2">Best for</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>U.S. rollout questions or feature-limit clarifications</li>
            <li>Billing, subscriptions, and checkout issues</li>
            <li>Account access, document upload, and workspace problems</li>
            <li>Privacy requests relating to the U.S.-facing version of the platform</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold mb-2">What to include</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>The email address on your account</li>
            <li>Screenshots or the exact error message where possible</li>
            <li>The page you were using and what you expected to happen</li>
            <li>Your court context if the issue depends on jurisdiction</li>
          </ul>
        </section>
      </div>
    </LegalPageLayout>
  );
}
