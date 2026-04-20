import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'How to Organise Court Documents for a Legal Case (UK Guide)';
const description =
  'Learn how to organise court documents for a UK legal case, including pleadings, orders, evidence, witness material, service records, and a working chronology.';

const stats: GuideStat[] = [
  {
    label: 'Main aim',
    value: 'Keep one clear case file instead of scattered documents and duplicate versions.',
  },
  {
    label: 'Core groups',
    value: 'Claim papers, court orders, evidence, correspondence, witness material, and service records.',
  },
  {
    label: 'Best for',
    value: 'Litigants in person handling a civil case without a law firm document system.',
  },
  {
    label: 'Important limit',
    value: 'The court order and civil procedure rules still control what must be filed, served, or exchanged.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'Why court document organisation matters',
    paragraphs: [
      'Self-represented cases rarely break down because there was no document at all. They usually become difficult because the right document is hard to find, the latest version is unclear, or the context of the paper has been lost.',
      'That is why document organisation is not an administrative extra. It is part of case preparation. A clear file makes it easier to understand the dispute, meet deadlines, and explain the case when you need to speak to the court or the other side.',
    ],
  },
  {
    title: 'What documents to keep in your main case file',
    paragraphs: [
      'The aim is to separate categories of material without losing the overall story of the case. Most litigants in person benefit from grouping the file by document type and then keeping a chronology beside it.',
      'If a court order arrives later, it should slot into the same structure rather than creating a new pile of disconnected paperwork.',
    ],
    bullets: [
      'Claim papers, defence, reply, and other formal pleadings.',
      'Court orders, notices, questionnaires, and hearing information.',
      'Evidence such as contracts, invoices, emails, letters, photographs, or screenshots.',
      'Witness material and draft statements.',
      'Correspondence with the other side, the court, or advisers.',
      'Proof of service, proof of filing, and payment receipts where relevant.',
    ],
  },
  {
    title: 'Use a chronology and simple naming system',
    paragraphs: [
      'A chronology keeps the case readable. It lets you move from a document to the event it relates to, which is often the difference between feeling overwhelmed and knowing exactly what the file says.',
      'A simple naming system also helps. Put dates in a consistent format, give documents clear labels, and avoid saving multiple files called final, final2, or latest. The goal is quick recognition rather than clever filing.',
    ],
    bullets: [
      'Use one date format consistently, such as year-month-day.',
      'Label documents with the event or subject they relate to.',
      'Keep the current version clear if you are editing a draft.',
      'Update the chronology when a new event, letter, or order arrives.',
    ],
  },
  {
    title: 'Keep service and filing proof with the document',
    paragraphs: [
      'A document file is incomplete if it only shows what you meant to send. It should also show what was actually sent, when it was sent, and how you can prove it. CPR Part 6 and Form N215 are the obvious reminders that service is part of the case record, not a separate afterthought.',
      'That means proof of posting, email confirmations, certificates of service, and screenshots of submissions should stay attached to the relevant document or event.',
    ],
  },
  {
    title: 'Separate evidence, correspondence, and working notes',
    paragraphs: [
      'One common mistake is mixing everything together. Evidence is not the same as correspondence, and neither is the same as a rough working note. When all three live in one running stack, it becomes difficult to tell what is formal, what is supporting material, and what is still only a draft thought.',
      'A cleaner structure makes later tasks easier. Witness statements, hearing notes, and settlement discussions all become simpler when the underlying documents are already separated properly.',
    ],
  },
  {
    title: 'Common organisation mistakes',
    paragraphs: [
      'Most document problems appear slowly. They come from inconsistent naming, duplicated files, lost proof of service, and keeping only part of the paper trail because the rest looked unimportant at the time.',
      'A small amount of structure early on usually saves far more time later.',
    ],
    bullets: [
      'Keeping the only copy of a key document in an email inbox.',
      'Saving evidence without noting why it matters.',
      'Losing proof of service or proof of filing.',
      'Mixing draft witness material with final documents.',
      'Leaving the chronology to be built right before the hearing.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps organise court documents',
    paragraphs: [
      'MyMcKenzieCS is designed for this exact problem. It gives litigants in person one workspace for documents, notes, reminders, and research so the case stays readable as it develops.',
      'That makes later tasks easier because the file does not need to be rebuilt before every deadline, mediation appointment, or hearing.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/uk/litigant-in-person-uk',
    label: 'Litigant in person UK',
    description: 'Return to the main self-representation guide and the wider preparation picture.',
  },
  {
    href: '/uk/serving-court-documents-uk',
    label: 'Serving court documents UK',
    description: 'See how addresses for service, methods of service, and Form N215 fit into the document workflow.',
  },
  {
    href: '/uk/witness-statement-uk',
    label: 'Witness statement UK',
    description: 'Move from document organisation into drafting and serving factual evidence.',
  },
  {
    href: '/uk/court-bundle-preparation-uk',
    label: 'Court bundle preparation UK',
    description: 'Turn the organised file into a hearing bundle when the order or court process calls for one.',
  },
  {
    href: '/uk/legal-case-management-tool',
    label: 'Legal case management tool',
    description: 'See how MyMcKenzieCS turns the file structure into a repeatable case workflow.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/uk/organise-court-documents-uk',
});

export const revalidate = 86400;

export default function OrganiseCourtDocumentsUkPage() {
  return (
    <GuidePage
      path="/uk/organise-court-documents-uk"
      title={title}
      subtitle="A practical guide to sorting your claim papers, evidence, court orders, service records, and working notes into a case file you can actually use."
      meta="Published 27 March 2026 | England and Wales civil focus | Informational only"
      intro={[
        'People search for how to organise court documents in the UK when their case is starting to feel bigger than the papers they can hold in their head. The problem is rarely the existence of documents. It is the lack of a system that keeps the file readable.',
        'This guide gives that system at a practical level. It focuses on clarity, categories, chronology, and proof of service rather than legal jargon.',
      ]}
      publishedDate="2026-03-27"
      modifiedDate="2026-03-27"
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Turn the file into a hearing bundle"
      ctaText="Once the documents are organised, the next stage is usually a hearing-ready set of papers with clear pagination, indexing, and only the material that matters."
      primaryCta={{ href: '/uk/court-bundle-preparation-uk', label: 'Prepare the bundle' }}
      secondaryCta={{ href: '/uk/legal-case-management-tool', label: 'See the workflow' }}
    />
  );
}
