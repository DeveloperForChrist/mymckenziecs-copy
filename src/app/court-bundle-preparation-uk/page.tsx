import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Court Bundle Preparation UK: How to Organise a Hearing Bundle';
const description =
  'Learn what a court bundle usually is in England and Wales, how to prepare a paginated and indexed hearing bundle, what often goes into it, and where requirements vary by court or order.';

const stats: GuideStat[] = [
  {
    label: 'Main purpose',
    value: 'A usable hearing file of the documents the court needs to read or refer to.',
  },
  {
    label: 'Common format',
    value: 'Paginated and indexed, with only the relevant documents included.',
  },
  {
    label: 'Where it changes',
    value: 'Bundle rules vary by court, track, order, and whether the process is digital or paper-heavy.',
  },
  {
    label: 'Important limit',
    value: 'The live court order or practice direction in your own case always overrides general guidance.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What people usually mean by a court bundle',
    paragraphs: [
      'A court bundle is usually the organised set of documents the judge will need for the hearing. In simple terms, it is the point where your case file stops being a loose collection of papers and becomes a hearing-ready pack.',
      'The exact requirements vary by court and case type. Some courts or orders use the language of a hearing bundle, some refer to a trial bundle, and some require a core bundle if the papers become too large. The underlying job is the same: present the relevant documents in a form the court can follow.',
    ],
  },
  {
    title: 'What official guidance shows across different courts',
    paragraphs: [
      'Official guidance does not give one single bundle rule for every civil case. Instead, different courts and procedures set their own directions. GOV.UK Form 204 says a bundle should organise the documents in the standard way so that a judge can understand the appeal. In the Administrative Court, Practice Direction 54A says the parties must agree a paginated and indexed bundle of all relevant documents for the hearing, and where it exceeds 400 pages they must agree a paginated and indexed core bundle of the essential material.',
      'In the wider civil procedure rules, Practice Direction 29 treats the preparation of a trial bundle as one of the matters needed to prepare a multi-track case for trial. In the Online Civil Money Claims pilot, Practice Direction 51R says that for small claims the court may direct each party to upload the documents they want the court to consider, and the court will assemble those into a trial bundle. The recurring principle is the same, even though the mechanics vary by court and platform.',
    ],
    note: 'The cross-court principle in the second paragraph is an inference from multiple official sources. The exact bundle rule for your case depends on the court, the track, the order, and any specific digital process that applies.',
  },
  {
    title: 'What usually goes into a hearing bundle',
    paragraphs: [
      'The bundle should normally contain the documents that are actually needed to understand and decide the hearing. That means relevance matters more than volume. A large bundle with everything ever sent in the case is often less useful than a focused bundle that follows the issues clearly.',
      'The exact contents depend on the hearing, but the same categories appear repeatedly.',
    ],
    bullets: [
      'The pleadings or claim papers that show what the dispute is about.',
      'The latest court orders, notices, and directions relevant to the hearing.',
      'Witness statements and the exhibits or documents they rely on.',
      'The core contractual, factual, or correspondence documents needed to decide the issues.',
      'A chronology, list of issues, or essential documents list where the process or court expects one.',
      'Authorities only where they are relevant and the hearing requires or permits an authorities bundle.',
    ],
  },
  {
    title: 'How to prepare the bundle',
    paragraphs: [
      'The safest way to prepare a bundle is to start from an organised case file rather than trying to build everything the night before. If the documents are already grouped, named clearly, and tied to a chronology, bundle preparation becomes a selection exercise instead of a rescue exercise.',
      'Official guidance repeatedly points toward the same practical habits: agree contents where possible, keep the documents relevant, paginate and index the bundle, and separate the truly essential papers into a core bundle if the file becomes too large.',
    ],
    bullets: [
      'Start with the hearing purpose and the order so you know what documents are actually needed.',
      'Remove duplicates, draft versions, and documents that do not help the court decide the hearing.',
      'Put the documents into a logical order that matches the issues and chronology.',
      'Paginate the bundle consistently and build an index that points to the right page numbers.',
      'Where the bundle is very large, identify the essential documents that belong in a core bundle.',
      'Keep any digital filing or upload requirements separate from your rough working notes.',
    ],
  },
  {
    title: 'Common bundle mistakes',
    paragraphs: [
      'Bundle problems usually come from trying to compensate for a disorganised file too late. The result is often an overlong bundle, poor indexing, inconsistent page references, or key documents that are missing because no one tracked them properly during the case.',
      'A bundle should make the hearing easier to follow. If it creates more confusion than it removes, something has usually gone wrong earlier in the file management.',
    ],
    bullets: [
      'Including everything instead of only the documents that matter for the hearing.',
      'Using inconsistent pagination or changing page numbers after references have been written.',
      'Losing the latest order or forgetting to include the document that gives the hearing its context.',
      'Mixing rough working notes into the final hearing papers.',
      'Leaving the bundle until too late to review for missing pages, duplicates, or bad ordering.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps with bundle preparation',
    paragraphs: [
      'MyMcKenzieCS helps most before the final bundle exists. It keeps pleadings, evidence, notes, deadlines, and research together so the hearing file can be built from a coherent case record instead of a scattered inbox.',
      'That reduces the usual friction of bundle preparation: finding the latest document, checking what the order required, keeping witness material tied to the chronology, and remembering which papers are essential rather than merely available.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/organise-court-documents-uk',
    label: 'How to organise court documents UK',
    description: 'Start with the document system that makes bundle preparation possible.',
  },
  {
    href: '/how-to-prepare-small-claims-court-uk',
    label: 'How to prepare for small claims court UK',
    description: 'See how the hearing checklist leads into the hearing file and later bundle work.',
  },
  {
    href: '/witness-statement-uk',
    label: 'Witness statement UK',
    description: 'Keep witness evidence and exhibits aligned with the documents that will later sit in the bundle.',
  },
  {
    href: '/serving-court-documents-uk',
    label: 'Serving court documents UK',
    description: 'Keep proof of service and the final document trail connected to the bundle.',
  },
  {
    href: '/legal-case-management-tool',
    label: 'Legal case management tool',
    description: 'See how MyMcKenzieCS keeps the case file organised before you reach the bundle stage.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/court-bundle-preparation-uk',
});

export const revalidate = 86400;

export default function CourtBundlePreparationUkPage() {
  return (
    <GuidePage
      path="/court-bundle-preparation-uk"
      title={title}
      subtitle="A practical guide to what a court bundle usually is, how to prepare it clearly, and why bundle requirements depend on the court, track, and order."
      meta="Published 27 March 2026 | England and Wales civil focus | Informational only"
      intro={[
        'People searching for court bundle preparation in the UK are usually close to a hearing or already under an order that mentions a bundle. The problem is that the phrase sounds simple, but the actual requirements can vary by court, process, and whether the case is being run digitally or on paper.',
        'This guide keeps the answer practical. It explains the recurring bundle principles that appear in official guidance, then shows how MyMcKenzieCS helps you build a hearing-ready file without pretending there is one universal bundle rule for every case.',
      ]}
      publishedDate="2026-03-27"
      modifiedDate="2026-03-27"
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Build the bundle from a cleaner case file"
      ctaText="Bundle preparation is easier when the pleadings, evidence, chronology, service proof, and hearing notes have already been kept together from the start."
      primaryCta={{ href: '/organise-court-documents-uk', label: 'Organise documents' }}
      secondaryCta={{ href: '/pricing', label: 'Compare plans' }}
    />
  );
}
