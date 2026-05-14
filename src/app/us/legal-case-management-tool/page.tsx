import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Legal Case Management Tool for U.S. Legal Support Work';
const description =
  'See how a legal case management tool helps U.S. legal support professionals and self-represented users organize documents, notes, deadlines, and research in one workflow.';

const stats: GuideStat[] = [
  {
    label: 'Core jobs',
    value: 'Documents, exhibits, notes, deadlines, and research support in one structure.',
  },
  {
    label: 'Best for',
    value: 'People managing a civil case without a lawyer or a firm-style document system.',
  },
  {
    label: 'Main benefit',
    value: 'The case stays readable between filings, notices, hearings, and negotiation steps.',
  },
  {
    label: 'Important limit',
    value: 'You still remain responsible for court rules, filing choices, service, and legal strategy.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'Why a self-represented case still needs case management',
    paragraphs: [
      'A self-represented case usually becomes difficult because information stops staying connected. The problem is not only the law. It is also the practical load of documents, dates, exhibits, notices, and working notes.',
      'That is why a case-management tool matters even for one person. It reduces reconstruction. Instead of rebuilding the case picture every time a hearing or filing appears, you return to one working file.',
    ],
  },
  {
    title: 'The features that matter most',
    paragraphs: [
      'For a self-represented litigant, the useful features are usually practical. They help you find the right document, remember why it matters, and keep the next step visible.',
      'That matters in both state and federal settings, even though the exact procedure can vary widely by court.',
    ],
    bullets: [
      'A document store for pleadings, notices, exhibits, correspondence, and draft material.',
      'Notes that stay attached to the issues and timeline they relate to.',
      'A deadline and reminder system that tracks hearings, service dates, and filing targets.',
      'Research support that stays tied to the live case instead of floating in separate tabs.',
      'A repeatable path from “What happened?” to “What seems to matter next?”',
    ],
  },
  {
    title: 'How MyMcKenzieCS fits that workflow',
    paragraphs: [
      'MyMcKenzieCS is structured as a case support workspace rather than a generic productivity tool. The goal is to keep the matter coherent enough that preparation remains possible as the file grows.',
      'That means documents, notes, reminders, and research support all stay in the same place. The interface does not need to change for the U.S. version; the value comes from clearer jurisdiction-aware support and U.S.-specific public content around it.',
    ],
  },
  {
    title: 'Where a tool helps and where it does not replace a lawyer',
    paragraphs: [
      'A case-management tool is strongest where the problem is volume, timing, memory, and organization. It helps you hold the factual and procedural record together.',
      'It does not replace legal judgment about claims, defenses, evidence objections, local rule interpretation, settlement risk, or advocacy. It is best understood as a preparation layer, not a substitute for representation.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/us/self-represented-litigant-guide',
    label: 'U.S. self-represented litigant guide',
    description: 'Start with the broader reality of handling your own case in the United States.',
  },
  {
    href: '/us/organize-court-documents',
    label: 'How to organize court documents',
    description: 'See the document structure that usually sits at the center of a workable case file.',
  },
  {
    href: '/us/small-claims-court-guide',
    label: 'U.S. small claims court guide',
    description: 'See how simpler civil matters still become a document and deadline problem quickly.',
  },
  {
    href: '/us/case-law-research',
    label: 'U.S. case-law research guide',
    description: 'Understand how authority research fits into the same workflow as notes and exhibits.',
  },
  {
    href: '/us/pricing',
    label: 'U.S. pricing',
    description: 'Review plan tiers and the current scope of U.S. coverage.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/us/legal-case-management-tool',
});

export const revalidate = 86400;

export default function UsLegalCaseManagementToolPage() {
  return (
    <GuidePage
      path="/us/legal-case-management-tool"
      title={title}
      subtitle="A practical explanation of what a case-management tool should do for a U.S. self-represented litigant and how MyMcKenzieCS structures that workflow."
      meta="Updated 20 April 2026 | U.S. self-representation workflow | Informational only"
      intro={[
        'People usually search for a legal case management tool when the case has become harder to hold together mentally. They may already have the documents but not the structure, or they may know the dispute but not where their notes, deadlines, and research now sit.',
        'This page explains what a legal case management tool should actually do for a U.S. self-represented litigant and how MyMcKenzieCS approaches that problem inside the same shared workspace.',
      ]}
      publishedDate="2026-04-20"
      modifiedDate="2026-04-20"
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="See the document workflow"
      ctaText="The workflow becomes more useful when the file structure, chronology, and research notes all stay connected instead of being rebuilt before every court event."
      primaryCta={{ href: '/us/organize-court-documents', label: 'Organize documents' }}
      secondaryCta={{ href: '/us/pricing', label: 'Compare plans' }}
    />
  );
}
