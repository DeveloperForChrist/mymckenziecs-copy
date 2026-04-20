import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Self-Represented Litigant Guide for U.S. Court Users';
const description =
  'Understand what self-representation means in the United States, where the term “pro se” appears, and how to stay organized when handling your own case.';

const stats: GuideStat[] = [
  {
    label: 'Common terms',
    value: 'Self-represented litigant and pro se litigant are both widely used in U.S. courts.',
  },
  {
    label: 'Core reality',
    value: 'You remain responsible for rules, deadlines, forms, and what you file with the court.',
  },
  {
    label: 'Court limits',
    value: 'Court staff and self-help resources can explain process, but they cannot act as your lawyer.',
  },
  {
    label: 'Best support habit',
    value: 'Keep one organized file for documents, deadlines, questions, and research.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What “self-represented” and “pro se” usually mean',
    paragraphs: [
      'In the United States, courts often use the term self-represented litigant or pro se litigant for a person handling their own case without a lawyer. Federal courts use “pro se” frequently, while many self-help pages also use the plainer phrase “self-represented.”',
      'The main practical point is the same in either phrase: you are the person responsible for the case. That includes reading orders, meeting deadlines, filing papers, and understanding which rules appear to apply.',
    ],
  },
  {
    title: 'What the court can and cannot do for you',
    paragraphs: [
      'Many U.S. courts offer self-help pages, forms, clerk information, and procedural packets for people appearing without lawyers. That can make the process more understandable.',
      'But the court still cannot give legal advice or tell you what strategy to choose. Self-help resources may explain process, filing steps, or where to find forms, while leaving the judgment calls to you.',
    ],
  },
  {
    title: 'Why organization matters more than people expect',
    paragraphs: [
      'Self-representation often becomes overwhelming because the case stops being readable. The difficulty may come from volume and timing rather than from one dramatic legal issue.',
      'That is why a structured file matters. If you can quickly find the current pleading, the key exhibits, the next deadline, and the issue you are trying to understand, the case becomes more manageable.',
    ],
    bullets: [
      'Keep one chronology of events and filings.',
      'Store orders, notices, exhibits, and correspondence in clear groups.',
      'Write down what each document appears to matter for.',
      'Track local court requirements separately if your court uses them.',
    ],
  },
  {
    title: 'Where state and court differences matter',
    paragraphs: [
      'The U.S. legal system is not one single procedure. State rules, local rules, and federal rules can differ substantially, even when the dispute sounds similar.',
      'That means general guidance is best used as a way to organize questions and preparation. When the next step depends on local practice, the local court website, local rules, or official forms often become the controlling source to check next.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/us/small-claims-court-guide',
    label: 'U.S. small claims court guide',
    description: 'See how self-representation shows up in one of the most common entry points to civil court.',
  },
  {
    href: '/us/organize-court-documents',
    label: 'How to organize court documents',
    description: 'Move from the broad self-representation picture into a usable file structure.',
  },
  {
    href: '/us/legal-case-management-tool',
    label: 'Legal case management tool',
    description: 'See how MyMcKenzieCS turns the same organization habits into one workflow.',
  },
  {
    href: '/us/help',
    label: 'U.S. help',
    description: 'Get support with the shared workspace and the current U.S. rollout.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/us/self-represented-litigant-guide',
});

export const revalidate = 86400;

export default function UsSelfRepresentedGuidePage() {
  return (
    <GuidePage
      path="/us/self-represented-litigant-guide"
      title={title}
      subtitle="A practical guide to the language, limits, and preparation habits that matter when you are handling your own case in the United States."
      meta="Updated 20 April 2026 | U.S. self-representation | Informational only"
      intro={[
        'People search for self-represented litigant guidance when they are already dealing with a live court problem. They usually do not need abstract legal language first. They need clarity about what role they are actually occupying, what the court can help with, and how to keep the case from becoming administratively overwhelming.',
        'This page is written for that moment. It explains the role of a self-represented litigant in the United States and how MyMcKenzieCS helps keep the practical side of the case more organized.',
      ]}
      publishedDate="2026-04-20"
      modifiedDate="2026-04-20"
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Build the working file early"
      ctaText="Self-representation gets easier when the facts, filings, deadlines, and questions stop living in separate places."
      primaryCta={{ href: '/us/organize-court-documents', label: 'Organize the file' }}
      secondaryCta={{ href: '/us/legal-case-management-tool', label: 'See the workflow' }}
    />
  );
}
