import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'U.S. Help',
  description:
    'Get MyMcKenzieCS help with account access, billing, uploads, notes, deadlines, and U.S. rollout questions for the shared workspace.',
  path: '/us/help',
});

export const revalidate = 86400;

export default function UsHelpPage() {
  return (
    <LegalPageLayout
      title="U.S. Help"
      subtitle="Support for account access, billing, documents, and U.S.-specific rollout questions."
      meta="Reply times: within 1-2 business days"
    >
      <div className="space-y-8 text-base md:text-lg">
        <section>
          <h2 className="text-2xl font-semibold mb-2">Start here</h2>
          <p>
            The U.S. version uses the same core MyMcKenzieCS workspace, so most account, billing, and document questions work the same way.
          </p>
          <p className="mt-3">
            Visit the <a className="underline" href="/us/faq">U.S. FAQ</a> for rollout details, or use the <a className="underline" href="/us/contact">U.S. contact page</a> if you need support on the shared app.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold mb-2">What we can help with</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Account access or password issues</li>
            <li>Billing and subscription questions</li>
            <li>Document uploads and analysis</li>
            <li>Notes, deadlines, and case dashboard features</li>
            <li>Questions about the current U.S. rollout and feature limits</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold mb-2">When reporting a problem</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Share the email on your account</li>
            <li>Include screenshots or error messages</li>
            <li>Tell us the page and what you expected to happen</li>
            <li>Tell us whether your legal matter is in state court, federal court, or a local court if that context matters</li>
          </ul>
        </section>
      </div>
    </LegalPageLayout>
  );
}
