import LegalPageLayout from '@/components/layout/LegalPageLayout';

export const revalidate = 86400;

export default function HelpPage() {
  return (
    <LegalPageLayout
      title="Help"
      subtitle="Support for account access, billing, documents, and everyday questions."
      meta="Reply times: within 1-2 business days"
    >
      <div className="space-y-8 text-base md:text-lg">
        <section>
          <h2 className="text-2xl font-semibold mb-2">Start here</h2>
          <p>
            For the fastest answers, check the FAQ for plan details, uploads, and feature availability.
          </p>
          <p className="mt-3">
            Visit the <a className="underline" href="/faq">FAQ</a> for common questions, or contact us directly for help.
          </p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold mb-2">What we can help with</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Account access or password issues</li>
            <li>Billing and subscription questions</li>
            <li>Document uploads and analysis</li>
            <li>Notes, deadlines, and case dashboard features</li>
          </ul>
        </section>
        <section>
          <h2 className="text-2xl font-semibold mb-2">When reporting a problem</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Share the email on your account</li>
            <li>Include screenshots or error messages</li>
            <li>Tell us the page and what you expected to happen</li>
          </ul>
        </section>
      </div>
    </LegalPageLayout>
  );
}
