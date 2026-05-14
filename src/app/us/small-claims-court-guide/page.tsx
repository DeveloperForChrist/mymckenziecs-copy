import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'U.S. Small Claims Court Guide for Self-Represented Users';
const description =
  'Understand what usually matters in U.S. small claims court, where state and local differences appear, and how to stay organized from filing to hearing.';

const stats: GuideStat[] = [
  {
    label: 'Usual setting',
    value: 'Small claims is usually handled in state or local courts rather than one nationwide system.',
  },
  {
    label: 'Main variation',
    value: 'Claim limits, forms, service rules, and hearing process can vary by state, county, and court.',
  },
  {
    label: 'Practical challenge',
    value: 'Even simpler cases still become a filing, service, exhibit, and deadline problem quickly.',
  },
  {
    label: 'Best next check',
    value: 'The local court website, local forms, and official self-help resources for your court.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What people usually mean by “small claims court” in the U.S.',
    paragraphs: [
      'In the United States, small claims court usually refers to a simplified state or local court process for lower-value civil disputes. It is not one national court with one national rule set.',
      'That matters because people often search for one universal answer when the most important details may depend on the state, county, city, or specific court where the claim is filed.',
    ],
  },
  {
    title: 'What usually has to stay organized',
    paragraphs: [
      'Even where the process is simpler than larger civil litigation, small claims still tends to involve forms, notice, service, deadlines, and hearing preparation. The case can feel manageable at first and then become confusing because the paperwork is scattered.',
      'A simple file structure is often enough to reduce that problem significantly.',
    ],
    bullets: [
      'The claim form, response, and hearing notice.',
      'Proof of service or delivery.',
      'Receipts, photos, messages, contracts, or other exhibits.',
      'A short chronology of what happened and when.',
      'A one-page list of the points you want to explain clearly at hearing.',
    ],
  },
  {
    title: 'Where local rules matter most',
    paragraphs: [
      'Small claims process can differ on claim limits, who can appear, filing methods, service options, continuances, and what evidence the court expects. That is why local court instructions matter so much.',
      'General guides help you stay organized, but the local court website or official self-help page is often the place to check the controlling form names, deadlines, and hearing logistics.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps with small claims preparation',
    paragraphs: [
      'MyMcKenzieCS helps because small claims still becomes a document and deadline workflow quickly. A self-represented user usually needs one place to hold the claim papers, note the next court date, record the evidence, and preserve the reasoning behind each step.',
      'That makes the same shared workspace useful before filing, before service, and before the hearing. Instead of rebuilding the case each time, you keep working from one organized structure.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/us/self-represented-litigant-guide',
    label: 'U.S. self-represented litigant guide',
    description: 'Return to the broader self-representation guide and the bigger preparation picture.',
  },
  {
    href: '/us/organize-court-documents',
    label: 'How to organize court documents',
    description: 'Build the document system that keeps the claim, exhibits, and notices readable.',
  },
  {
    href: '/us/case-law-research',
    label: 'U.S. case-law research guide',
    description: 'See how authority research fits in when a small claims issue needs deeper checking.',
  },
  {
    href: '/us/legal-case-management-tool',
    label: 'Legal case management tool',
    description: 'See how MyMcKenzieCS turns those preparation habits into one workflow.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/us/small-claims-court-guide',
});

export const revalidate = 86400;

export default function UsSmallClaimsGuidePage() {
  return (
    <GuidePage
      path="/us/small-claims-court-guide"
      title={title}
      subtitle="A practical guide to what usually matters in U.S. small claims and where local procedure can differ more than people first expect."
      meta="Updated 20 April 2026 | U.S. small claims process | Informational only"
      intro={[
        'Searches for U.S. small claims guidance often come from people who want the simplest possible route through a dispute. What they usually need instead is a clear explanation of which parts are simple, which parts vary locally, and how to keep the file organized.',
        'This page explains that at a high level and shows where MyMcKenzieCS fits when a self-represented user needs the case to remain coherent from filing through hearing.',
      ]}
      publishedDate="2026-04-20"
      modifiedDate="2026-04-20"
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Turn the dispute into a usable file"
      ctaText="The easier the case seems, the more tempting it is to stay informal. A working file helps prevent that from becoming a problem later."
      primaryCta={{ href: '/us/organize-court-documents', label: 'Organize the file' }}
      secondaryCta={{ href: '/us/pricing', label: 'Compare plans' }}
    />
  );
}
