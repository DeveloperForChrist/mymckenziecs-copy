import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Legal Case Management Tool for UK Litigants in Person';
const description =
  'See how a legal case management tool helps self-represented court users organise documents, notes, reminders, and research, and how MyMcKenzieCS structures that workflow.';

const stats: GuideStat[] = [
  {
    label: 'Core jobs',
    value: 'Documents, evidence, notes, reminders, and research in one system.',
  },
  {
    label: 'Best for',
    value: 'People managing their own case and trying to avoid scattered preparation.',
  },
  {
    label: 'Plan options',
    value: 'Basic, Premium, and Premium + depending on workload and research needs.',
  },
  {
    label: 'Important limit',
    value: 'You remain responsible for strategy, filings, service, and court decisions.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What a legal case management tool means for an individual user',
    paragraphs: [
      'Large law firms use case-management software because legal work quickly becomes a coordination problem. A self-represented person has the same coordination problem in smaller form: the documents still need to be found, the issues still need to be tracked, and the deadlines still need to be met.',
      'For litigants in person, a legal case management tool is not about enterprise dashboards or office administration. It is about keeping the live case coherent enough that you can prepare properly and make decisions from a clear record instead of a scattered memory.',
    ],
  },
  {
    title: 'The features that usually matter most',
    paragraphs: [
      'People often start by searching for legal case management because something feels out of control. The most useful tools solve that by reducing fragmentation. They keep the paperwork, timing, and research connected so that one task informs the next.',
      'For a self-represented case, the features that matter are usually practical rather than flashy.',
    ],
    bullets: [
      'A document store for pleadings, evidence, orders, letters, and hearing papers.',
      'Notes that stay attached to the actual issues in the case.',
      'A timeline or reminder system so dates do not live only in memory.',
      'Research support with citations so procedural explanations can be checked later.',
      'A repeatable way to move from "What do I do next?" to a short action list.',
    ],
  },
  {
    title: 'How MyMcKenzieCS structures that workflow',
    paragraphs: [
      'MyMcKenzieCS is designed as a legal self-help workspace rather than a generic productivity app. The product is structured around the tasks litigants in person repeatedly face: understanding procedure, keeping evidence organised, tracking court dates, and preserving the context of earlier work.',
      'That structure shows up across the plans. Basic focuses on core assistant access, document storage, conversation history, and limited daily web research with source citations. Premium expands storage and research access and adds scheduled reminder emails before saved events. Premium + is built for heavier workloads with persistent chat history, enhanced research support with source citations, and advanced case law retrieval and study.',
    ],
  },
  {
    title: 'Why this matters in real case preparation',
    paragraphs: [
      'The value of a legal case management tool is not the software itself. The value is that it stops the case from constantly resetting. When you open the file, you should be able to see the latest documents, your current questions, the next deadline, and the authorities or sources you are relying on.',
      'That is especially important if you are trying to prepare around work, family, or urgent case developments. A good workflow saves cognitive energy for the legal problem instead of spending it on reconstruction.',
    ],
    bullets: [
      'Less time looking for the right version of a document.',
      'Fewer missed follow-ups after hearings or directions.',
      'Clearer handoff between reading papers, making notes, and planning action.',
      'Better preparation for paid legal advice because your material is already organised.',
    ],
  },
  {
    title: 'When a tool helps and when you still need a human lawyer',
    paragraphs: [
      'A legal case management tool helps with structure, memory, and workflow. It is strong where the problem is complexity, volume, or inconsistency. It does not replace legal judgment on merits, disclosure disputes, evidence strategy, settlement, or advocacy.',
      'The strongest use of MyMcKenzieCS is often as the preparation layer around other support. It helps you arrive at legal advice, mediation, or a hearing better organised and more precise about the issues you need answered.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/litigant-in-person-uk',
    label: 'Guide for litigants in person',
    description: 'See the wider self-representation context that makes case-management tools valuable.',
  },
  {
    href: '/organise-court-documents-uk',
    label: 'How to organise court documents UK',
    description: 'See the document workflow that sits at the centre of most self-managed court cases.',
  },
  {
    href: '/court-bundle-preparation-uk',
    label: 'Court bundle preparation UK',
    description: 'See how the organised file becomes a hearing bundle and core bundle where the process requires one.',
  },
  {
    href: '/case-law-search-uk',
    label: 'Case law search UK',
    description: 'Learn how legal research fits into the same workflow as documents and deadlines.',
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
      subtitle="A practical explanation of what a case-management tool should do for a self-represented user and how MyMcKenzieCS turns that into a working court-preparation system."
      meta="Updated 17 March 2026 | UK self-representation workflow | Informational only"
      intro={[
        'Searches for "legal case management tool" often come from people who know their case is becoming harder to hold in their head. They may already have the documents, but not the structure. They may know the issues, but not where their notes, deadlines, and research now sit.',
        'This page explains what a legal case management tool should actually do for a litigant in person and how MyMcKenzieCS approaches that problem in a UK court-support context.',
      ]}
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="See the workflow in action"
      ctaText="The workflow becomes real when it moves from raw documents into an organised file, then into a hearing-ready bundle, issue list, and next-step plan."
      primaryCta={{ href: '/organise-court-documents-uk', label: 'Organise documents' }}
      secondaryCta={{ href: '/pricing', label: 'Compare plans' }}
    />
  );
}
