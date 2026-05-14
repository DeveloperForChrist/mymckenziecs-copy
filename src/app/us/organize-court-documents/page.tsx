import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'How to Organize Court Documents for a U.S. Legal Case';
const description =
  'Learn how to organize pleadings, notices, exhibits, correspondence, and service proof into a readable working file for a U.S. court case.';

const stats: GuideStat[] = [
  {
    label: 'Main aim',
    value: 'Keep one clear working file instead of scattered PDFs, screenshots, and duplicate versions.',
  },
  {
    label: 'Core groups',
    value: 'Pleadings, court notices, exhibits, correspondence, service proof, and chronology.',
  },
  {
    label: 'Best for',
    value: 'Self-represented litigants in state, local, or federal civil matters.',
  },
  {
    label: 'Important limit',
    value: 'The court’s own rules and orders still control what has to be filed, served, or exchanged.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'Why court document organization matters',
    paragraphs: [
      'Self-represented cases rarely become difficult because there was no document at all. They usually become difficult because the right document is hard to find, the latest version is unclear, or the context behind the paper has been lost.',
      'That is why organization is part of preparation, not an extra administrative task. A clear file makes it easier to explain the case, respond to court notices, and prepare for the next deadline without guessing.',
    ],
  },
  {
    title: 'What documents to keep in the main case file',
    paragraphs: [
      'The goal is to separate categories of material without losing the overall story of the case. Most self-represented users benefit from grouping by document type and keeping a chronology beside it.',
      'If a new notice or order arrives, it should fit into the same structure instead of creating one more disconnected folder.',
    ],
    bullets: [
      'Complaint, answer, motions, and other formal pleadings.',
      'Court notices, scheduling orders, and hearing information.',
      'Exhibits such as contracts, receipts, messages, photos, and screenshots.',
      'Correspondence with the court, the other side, or any adviser.',
      'Proof of service, proof of filing, and delivery confirmations.',
      'Working notes and a running chronology.',
    ],
  },
  {
    title: 'Use a chronology and simple naming system',
    paragraphs: [
      'A chronology keeps the case readable. It links the paperwork to the events, which often makes the difference between feeling buried and knowing exactly what happened when.',
      'A simple naming system helps as well. Use consistent dates, give files clear labels, and make the current version obvious if you are revising a document.',
    ],
  },
  {
    title: 'Keep proof with the document, not somewhere else',
    paragraphs: [
      'A file is incomplete if it shows only what you meant to send or file. It should also show what was actually sent, when it was sent, and what proves that happened.',
      'That means mailing records, e-filing confirmations, service returns, and email delivery confirmations should stay attached to the relevant filing or event.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps organize the case file',
    paragraphs: [
      'MyMcKenzieCS is built for exactly this problem. It gives self-represented users one workspace for documents, notes, reminders, and research so the case stays readable as it develops.',
      'That makes later tasks easier because the file does not need to be rebuilt before every hearing, filing, or negotiation step.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/us/self-represented-litigant-guide',
    label: 'U.S. self-represented litigant guide',
    description: 'Return to the wider self-representation picture and the practical habits that support it.',
  },
  {
    href: '/us/small-claims-court-guide',
    label: 'U.S. small claims court guide',
    description: 'See how a simpler civil matter still turns into a document and notice workflow quickly.',
  },
  {
    href: '/us/legal-case-management-tool',
    label: 'Legal case management tool',
    description: 'See how MyMcKenzieCS turns the document structure into a repeatable workflow.',
  },
  {
    href: '/us/case-law-research',
    label: 'U.S. case-law research guide',
    description: 'Keep authority research tied to the same working file instead of losing it in separate tabs.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/us/organize-court-documents',
});

export const revalidate = 86400;

export default function UsOrganizeCourtDocumentsPage() {
  return (
    <GuidePage
      path="/us/organize-court-documents"
      title={title}
      subtitle="A practical guide to sorting pleadings, notices, exhibits, service proof, and working notes into a case file you can actually use."
      meta="Updated 20 April 2026 | U.S. document workflow | Informational only"
      intro={[
        'People search for how to organize court documents when the case is already starting to feel bigger than the papers they can hold in their head. The problem is rarely that the documents do not exist. It is that the file no longer stays readable.',
        'This guide gives a practical structure for fixing that. It focuses on categories, chronology, naming, and proof rather than court jargon.',
      ]}
      publishedDate="2026-04-20"
      modifiedDate="2026-04-20"
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Turn the file into a working case system"
      ctaText="Once the documents are organized, it becomes much easier to connect them to deadlines, hearings, and the questions you still need to answer."
      primaryCta={{ href: '/us/legal-case-management-tool', label: 'See the workflow' }}
      secondaryCta={{ href: '/us/pricing', label: 'Compare plans' }}
    />
  );
}
