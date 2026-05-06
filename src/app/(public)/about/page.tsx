import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'About',
  description:
    'Learn why MyMcKenzieCS was built and how the platform supports McKenzie Friends, legal support professionals, and the clients they help.',
  path: '/about',
});

export const revalidate = 86400;

export default function AboutPage() {
  return (
    <LegalPageLayout
      title="About"
      subtitle="Why we built MyMcKenzieCS and who it serves."
      meta="Built by Lenjordan Ltd • Legal support practice workspace"
    >
      <div className="space-y-6 text-base md:text-lg">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Our Purpose</h2>
          <p>
            MyMcKenzieCS is a case support workspace designed for McKenzie Friends, paralegals,
            legal consultants, independent legal support professionals, and the clients they support.
          </p>
          <p className="mt-3">
            Client support work can quickly become scattered across messages, emails, folders, notes, and calendars.
            We built this platform so legal support work can be managed in one calmer, more professional place.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">What We Provide</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Client matter organisation for documents, notes, chronology, and deadlines</li>
            <li>Workspace tools for legal support providers and the clients they assist</li>
            <li>Document upload, case context, and preparation support</li>
            <li>Dashboard and timeline organisation for active matters</li>
            <li>Plain-English court information and careful tone support</li>
            <li>Subscription tiers for different workloads</li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">Not a Law Firm</h2>
          <p>
            MyMcKenzieCS does not provide legal advice and is not a law firm or regulated legal service.
            All support offered is informational, procedural, organisational, and practice-support focused. Users
            remain responsible for legal decisions, filings, and any regulated legal work.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">Who We Are</h2>
          <p>
            MyMcKenzieCS is a legal support platform designed around the practical work of helping people manage court-related matters.
            It provides tools that help users organise client matters, understand procedural information, prepare documents, review case materials, and keep work structured.
            The platform is designed to make legal support work more accessible and manageable. MyMcKenzieCS provides technology and informational support,
            but it is not a law firm and does not provide legal advice.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">Our Vision</h2>
          <p>
            To build the leading workspace for independent legal support work, helping McKenzie Friends and related
            professionals give clients a clearer, more organised experience without replacing regulated legal advice.
          </p>
        </div>
      </div>
    </LegalPageLayout>
  );
}
