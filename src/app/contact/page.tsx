import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact',
  description:
    'Contact the MyMcKenzieCS team for support, billing questions, or privacy requests.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <LegalPageLayout
      title="Contact"
      subtitle="Reach the MyMcKenzieCS team for help, support, or account questions."
        meta="Support hours: Mon–Fri, 9:00–17:00 (UK)"
    >
      <div className="space-y-8 text-base md:text-lg">
        <section>
          <h2 className="text-2xl font-semibold mb-2">Primary contact</h2>
          <p>
            Email: <a href="mailto:jordan@lenjordan.tech" className="text-blue-600 hover:underline">jordan@lenjordan.tech</a>
          </p>
          <p className="mt-2">We respond in 3-4 business days.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold mb-2">Billing</h2>
          <p>Include your account email and any relevant order details.</p>
        </section>
        <section>
          <h2 className="text-2xl font-semibold mb-2">Data & privacy</h2>
          <p>If you have a privacy request, include &quot;Privacy Request&quot; in the subject line.</p>
        </section>
      </div>
    </LegalPageLayout>
  );
}
