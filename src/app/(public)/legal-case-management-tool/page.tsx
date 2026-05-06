import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Case Support Software for Legal Support Practices';
const description =
  'See how MyMcKenzieCS helps McKenzie Friends, legal support professionals, and the clients they support organise documents, notes, reminders, payments, and research in one workspace.';

const stats: GuideStat[] = [
  {
    label: 'Core jobs',
    value: 'Clients, documents, evidence, notes, reminders, payments, and research in one system.',
  },
  {
    label: 'Best for',
    value: 'McKenzie Friends and legal support professionals managing active client matters.',
  },
  {
    label: 'Plan options',
    value: 'Basic, Premium, and Premium + depending on workload and research needs.',
  },
  {
    label: 'Important limit',
    value: 'Practice support and court information only. Not legal advice or representation.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What case support software means for a small legal support practice',
    paragraphs: [
      'Legal support work quickly becomes a coordination problem. Client messages, court orders, evidence, notes, payments, and deadlines all need to stay connected if the service is going to feel professional.',
      'For McKenzie Friends and similar providers, case support software is not about enterprise law-firm complexity. It is about keeping each client matter coherent enough that preparation, communication, and follow-up do not depend on scattered memory.',
    ],
  },
  {
    title: 'The features that usually matter most',
    paragraphs: [
      'People often start looking for case management because the work has become too fragmented. The most useful tools keep paperwork, timing, notes, payments, and research connected so one task informs the next.',
      'For independent legal support work, the features that matter are usually practical rather than flashy.',
    ],
    bullets: [
      'A document store for client papers, evidence, orders, letters, and hearing materials.',
      'Notes that stay attached to the actual client matter and issues.',
      'A timeline or reminder system so dates do not live only in memory or WhatsApp.',
      'Research support with citations so procedural explanations can be checked later.',
      'A repeatable way to move from scattered updates to a clear next-action list.',
    ],
  },
  {
    title: 'How MyMcKenzieCS structures that workflow',
    paragraphs: [
      'MyMcKenzieCS is designed as a legal support workspace rather than a generic productivity app. The product is structured around the tasks McKenzie Friends and legal support professionals repeatedly face: keeping client context, documents, notes, deadlines, and research in one organised place.',
      'That structure shows up across the plans. Basic focuses on core assistant access, document storage, conversation history, and limited daily web research with source citations. Premium expands storage and research access and adds scheduled reminder emails before saved events. Premium + is built for heavier workloads with persistent chat history, enhanced research support with source citations, and advanced case law retrieval and study.',
    ],
  },
  {
    title: 'Why this matters in real case preparation',
    paragraphs: [
      'The value of a case support workspace is not the software itself. The value is that it stops each client matter from constantly resetting. When you open the file, you should be able to see the latest documents, open questions, the next deadline, and the sources being relied on.',
      'That is especially important when you are supporting several clients at once. A good workflow saves attention for the support work instead of spending it on reconstruction.',
    ],
    bullets: [
      'Less time looking for the right version of a document.',
      'Fewer missed follow-ups after hearings or directions.',
      'Clearer handoff between reading papers, making notes, and planning action.',
      'A more professional client experience because the material is already organised.',
    ],
  },
  {
    title: 'When a tool helps and when you still need a human lawyer',
    paragraphs: [
      'A legal case management tool helps with structure, memory, and workflow. It is strong where the problem is complexity, volume, or inconsistency. It does not replace legal judgment on merits, disclosure disputes, evidence strategy, settlement, or advocacy.',
      'The strongest use of MyMcKenzieCS is as the preparation and organisation layer around legal support work. It helps client matters stay clearer without pretending to replace regulated legal advice.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/litigant-in-person-uk',
    label: 'Litigant in person guide',
    description: 'Start with the wider self-representation context that makes case-management tools valuable.',
  },
  {
    href: '/organise-court-documents-uk',
    label: 'How to organise court documents',
    description: 'See the document workflow that sits at the centre of most self-managed court cases.',
  },
  {
    href: '/court-bundle-preparation-uk',
    label: 'Court bundle preparation',
    description: 'See how an organised file becomes a paginated hearing bundle when the process requires one.',
  },
  {
    href: '/case-law-search-uk',
    label: 'Case-law search guide',
    description: 'Learn how authority research fits into the same workflow as documents and deadlines.',
  },
  {
    href: '/faq',
    label: 'Plans FAQ',
    description: 'Check what is included in Basic, Premium, and Premium + before choosing a plan.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/legal-case-management-tool',
});

export const revalidate = 86400;

export default function LegalCaseManagementToolPage() {
  return (
    <GuidePage
      path="/legal-case-management-tool"
      title={title}
      subtitle="A practical explanation of how McKenzie Friends and legal support professionals can manage client matters in one organised workspace."
      meta="Updated 17 March 2026 | Legal support workflow | Informational only"
      intro={[
        'Independent legal support work often starts simply and then becomes harder to hold together. You may already have the documents, client messages, dates, and notes, but not the structure.',
      'This page explains what case support software should actually do for McKenzie Friends, legal support professionals, and the clients they support, and how MyMcKenzieCS approaches that problem in a court-support context.',
      ]}
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="See the workflow in action"
      ctaText="The workflow becomes real when raw documents, client notes, deadlines, and preparation tasks become one organised client matter."
      primaryCta={{ href: '/organise-court-documents-uk', label: 'Organise documents' }}
      secondaryCta={{ href: '/pricing', label: 'Compare plans' }}
    />
  );
}
