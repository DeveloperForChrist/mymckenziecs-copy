import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Witness Statement UK: How to Prepare and Serve One';
const description =
  'Learn what a witness statement usually needs in England and Wales, how it is structured, when it is served, and how MyMcKenzieCS helps keep witness evidence organised.';

const stats: GuideStat[] = [
  {
    label: 'Main purpose',
    value: 'Written factual evidence from a witness, including a party who will give evidence.',
  },
  {
    label: 'Core elements',
    value: 'Case name, claim number, witness details, numbered paragraphs, statement of truth, signature, and date.',
  },
  {
    label: 'Service rule',
    value: 'Statements are usually served on the other side by the deadline in the order, not filed with the court at that stage.',
  },
  {
    label: 'Important limit',
    value: 'A witness statement is evidence, not a place for broad argument or legal submissions.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What a witness statement is',
    paragraphs: [
      'A witness statement is the written evidence a witness gives about facts they know. In civil cases, that includes your own statement if you are a party and will be giving evidence yourself. For a litigant in person, it is often one of the most important documents in the case because it becomes the structured version of what you say happened.',
      'That is why witness statements matter so much. They are not just notes for a hearing. They are part of the formal evidence picture the court and the other side will read before trial or a final hearing.',
    ],
  },
  {
    title: 'What a witness statement usually needs to contain',
    paragraphs: [
      'The Justice UK guidance gives a clear starting layout. A witness statement should start with the case name and claim number, state the full name and address of the witness, set out the evidence clearly in numbered paragraphs on numbered pages, end with the statement of truth, and be signed and dated.',
      'For many litigants in person, the real challenge is not the template. It is separating factual evidence from frustration, commentary, or legal argument. The statement should normally tell the court what the witness knows, what they saw, what documents they rely on, and how the events unfolded.',
    ],
    bullets: [
      'Start with the court case title and claim number.',
      'Identify the witness clearly and use numbered paragraphs.',
      'Keep the statement factual, chronological, and readable.',
      'Use exhibits carefully if documents are being referred to.',
      'Finish with the statement of truth and sign and date it.',
    ],
  },
  {
    title: 'How to make the statement useful',
    paragraphs: [
      'The best witness statements are specific and disciplined. They explain the facts in a way another reader can follow without having to reconstruct the timeline from emails, screenshots, and memory. That usually means dealing with the story in sequence and explaining what each important document shows.',
      'If you are representing yourself, it is often worth drafting the chronology first and then building the witness statement from it. That reduces repetition and makes it easier to see where the evidence is strong, where it is missing, and where you may be drifting into argument instead of testimony.',
    ],
  },
  {
    title: 'When and how witness statements are served',
    paragraphs: [
      'The standard civil directions on factual evidence say that by the deadline in the order, parties must serve on each other copies of the signed statements of themselves and all witnesses they intend to rely on. The same guidance explains that the copies go to the other side or sides, not to the court at that stage.',
      'That distinction matters because many litigants in person assume every important document should immediately be sent to the court. Often the court order will tell you when statements are to be served and what happens next. The same directions warn that oral evidence may not be permitted from a witness whose statement was not served on time, except with permission from the court.',
    ],
    note: 'Always check the wording of the actual order in your case. A general guide helps with structure, but the live court deadline in your own proceedings is what controls the next step.',
  },
  {
    title: 'How MyMcKenzieCS helps with witness evidence',
    paragraphs: [
      'MyMcKenzieCS helps most at the stage before the document is final. It keeps your chronology, evidence, notes, and earlier drafts in one place so the witness statement grows out of the case file instead of being written from scratch each time.',
      'That is useful because witness statements usually go wrong when the underlying material is scattered. If your documents, issue notes, and timeline are already organised, drafting becomes far more deliberate and less reactive.',
    ],
    bullets: [
      'Keep the draft statement beside the documents it refers to.',
      'Track issues, dates, and hearing preparation in the same workspace.',
      'Use reminder workflows so statement deadlines do not slip.',
      'Preserve earlier guidance and research while refining the evidence narrative.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/litigant-in-person-uk',
    label: 'Guide for litigants in person',
    description: 'Return to the main self-representation hub and the wider process questions around civil cases.',
  },
  {
    href: '/organise-court-documents-uk',
    label: 'How to organise court documents UK',
    description: 'Keep statement drafts, exhibits, chronology, and final evidence inside one case file.',
  },
  {
    href: '/serving-court-documents-uk',
    label: 'Serving court documents',
    description: 'See how service works and when Form N215 may matter after witness statements are exchanged.',
  },
  {
    href: '/court-bundle-preparation-uk',
    label: 'Court bundle preparation UK',
    description: 'See how witness statements and exhibits usually fit into the later hearing bundle.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/witness-statement-uk',
});

export const revalidate = 86400;

export default function WitnessStatementUkPage() {
  return (
    <GuidePage
      path="/witness-statement-uk"
      title={title}
      subtitle="A practical guide to structuring witness evidence, understanding service deadlines, and keeping the statement tied to the live case file."
      meta="Updated 17 March 2026 | England and Wales civil focus | Informational only"
      intro={[
        'Searches for "witness statement UK" usually come from people who already know evidence is becoming the next pressure point. They need more than a blank template. They need to know what a civil witness statement is for, what it should contain, and what the service deadline usually means in practice.',
        'This page keeps the answer practical. It explains the standard layout, the service rule, and how MyMcKenzieCS helps you organise the material that sits behind the final statement.',
      ]}
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Keep witness evidence hearing-ready"
      ctaText="A statement becomes much easier to use when the chronology, exhibits, service proof, and hearing bundle all grow from the same organised file."
      primaryCta={{ href: '/court-bundle-preparation-uk', label: 'Prepare the bundle' }}
      secondaryCta={{ href: '/organise-court-documents-uk', label: 'Organise evidence' }}
    />
  );
}
