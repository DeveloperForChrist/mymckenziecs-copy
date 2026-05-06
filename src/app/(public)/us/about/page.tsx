import type { Metadata } from 'next';
import LegalPageLayout from '@/components/layout/LegalPageLayout';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'About the U.S. Version',
  description:
    'Learn why MyMcKenzieCS now has a U.S. version and how the shared workspace supports legal support professionals and self-represented users with organization and procedural support.',
  path: '/us/about',
});

export const revalidate = 86400;

export default function UsAboutPage() {
  return (
    <LegalPageLayout
      title="About the U.S. Version"
      subtitle="Why we added a U.S. route and what stays shared across the product."
      meta="Built by Lenjordan Ltd • Legal support work in one workspace"
    >
      <div className="space-y-6 text-base md:text-lg">
        <div>
          <h2 className="text-2xl font-semibold mb-2">Why this version exists</h2>
          <p>
            The U.S. version of MyMcKenzieCS exists so legal support professionals and self-represented users can use the same case-management workflow without feeling like every page was written only for a UK matter.
          </p>
          <p className="mt-3">
            We kept the product UI the same and focused on the parts that matter most first: public-page wording, jurisdiction-aware support, and a cleaner path for U.S. users entering the app.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">What the U.S. version includes</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>The same shared workspace for documents, notes, deadlines, and AI-assisted support</li>
            <li>U.S.-specific public pages and terminology</li>
            <li>Guides written for U.S. legal support contexts and self-represented court users</li>
            <li>Jurisdiction-aware support that can distinguish UK and U.S. contexts</li>
          </ul>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">What is still growing</h2>
          <p>
            U.S. authority coverage is still developing. State and local procedure can vary heavily, so the rollout is focusing on structure, organization, and jurisdiction-aware guidance before full U.S. case-law depth.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">Not a law firm</h2>
          <p>
            MyMcKenzieCS does not provide legal advice and is not a law firm or regulated legal service. All support is informational, procedural, and organizational. You remain responsible for legal decisions, filings, and compliance with local court rules.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-2">Our direction</h2>
          <p>
            The goal is to make one strong case support workspace usable across jurisdictions without forcing separate products for every country or court system. The U.S. version is the next step in that rollout.
          </p>
        </div>
      </div>
    </LegalPageLayout>
  );
}
