import React from 'react';
import LegalPageLayout from '@/components/layout/LegalPageLayout';

export default function ContactPage() {
  return (
    <LegalPageLayout
      title="Contact"
      subtitle="Reach the MyMcKenzieCS team for help, support, or account questions."
      meta="Support hours: Mon–Fri, 9:00–18:00 (UK)"
    >
      <div className="space-y-8 text-base md:text-lg">
        <section>
          <h2 className="text-2xl font-semibold mb-2">Primary contact</h2>
          <p>
            Email: <a href="mailto:support@mymckenziecs.com" className="text-blue-600 hover:underline">support@mymckenziecs.com</a>
          </p>
          <p className="mt-2">We respond in 1-2 business days.</p>
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
