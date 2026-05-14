import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Case Law Search in the UK: How to Research and Stay Organised';
const description =
  'Learn how to search case law in the UK using official judgment sources, neutral citations, and filters, and how MyMcKenzieCS helps turn research into usable case preparation.';

const stats: GuideStat[] = [
  {
    label: 'Best starting point',
    value: 'The National Archives Find Case Law service for official judgments.',
  },
  {
    label: 'Search inputs',
    value: 'Keywords, neutral citations, party names, courts, judges, and dates.',
  },
  {
    label: 'How MyMcKenzieCS helps',
    value: 'Research notes, source-backed guidance, and Premium + case-law study tools.',
  },
  {
    label: 'Important limit',
    value: 'Research supports understanding and preparation; it does not replace legal advice.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'Where to start with UK case law search',
    paragraphs: [
      'For official judgment research, the clearest starting point is The National Archives Find Case Law service. It provides free access to court judgments and tribunal decisions from England and Wales, together with UK-wide Supreme Court and Privy Council cases that have been made publicly available in digital form.',
      'That matters because many people begin with general search engines and quickly end up on outdated commentary, partial summaries, or pages that do not match the decision they actually need. Starting with the official judgment source gives you a cleaner base.',
    ],
  },
  {
    title: 'How to search more effectively',
    paragraphs: [
      'The National Archives guidance is useful because it explains what the service can search and how to narrow the results. You can search the full text of judgments as well as details such as court name and neutral citation, and then filter by dates, courts, party names, or judge names.',
      'If you are doing case-law search in the UK for your own matter, the aim is rarely to read everything on a topic. It is to find the few authorities that match your issue closely enough to improve your understanding or point you to a legal argument that needs deeper checking.',
    ],
    bullets: [
      'Use a neutral citation if you know it, because that is the most precise search input.',
      'Use quote marks for exact phrases when searching by wording.',
      'Try party names, the court, or the judge if the keyword search is too broad.',
      'Use date filters when the area has developed over time or you need a recent decision.',
      'Browse the relevant court or tribunal if you know the jurisdiction but not the exact case name.',
    ],
  },
  {
    title: 'What to watch for when you find a judgment',
    paragraphs: [
      'Finding a case is only the first step. You still need to check whether it is the right court level, whether it is actually on the point you care about, and whether it may have been appealed or distinguished later. The National Archives notes that Find Case Law is not a complete record of every court decision and that not all lower court decisions are written down or transcribed.',
      'For self-represented users, that means case law is usually best used as a research and preparation tool rather than a shortcut to certainty. It can help you understand language, structure issues, and identify where professional advice may be needed.',
    ],
    bullets: [
      'Read the case against the issue you are trying to understand, not just the headline.',
      'Check the court level and the date before assuming the case is strongly persuasive.',
      'Be careful with summaries that omit procedural context or unusual facts.',
      'Where possible, check whether the case has been appealed or sits alongside later authority.',
    ],
  },
  {
    title: 'How MyMcKenzieCS supports case-law research',
    paragraphs: [
      'MyMcKenzieCS is useful here because research becomes far more valuable when it stays attached to the live case. Instead of finding a judgment and then losing the note about why it mattered, you can keep your document review, issue tracking, and research support in the same workspace.',
      'On paid plans, MyMcKenzieCS includes source-cited research support for procedural and contextual questions. Premium + adds advanced case-law retrieval and study tools, designed to help users work through authorities more systematically for legal understanding and preparation.',
    ],
    bullets: [
      'Keep research questions next to the documents and issues they relate to.',
      'Store notes on citations, themes, and relevance inside the same case workspace.',
      'Use source-backed research support to reduce unsupported searching.',
      'Move from "I found a case" to "I know why this authority might matter to my case."',
    ],
  },
  {
    title: 'A practical research workflow for litigants in person',
    paragraphs: [
      'A workable routine is usually: define the legal or procedural issue, search official sources, note the cases that appear most relevant, record what each authority seems to say, and then decide whether you need further advice before relying on it. The goal is organised understanding, not improvised advocacy.',
      'If you are new to the whole system, pair this page with the wider guide for litigants in person. If you already know the case is becoming document-heavy, the legal case management tool guide is the next step because good research is only useful when it remains organised.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/litigant-in-person-uk',
    label: 'Guide for litigants in person',
    description: 'See how research fits into the wider reality of preparing your own case.',
  },
  {
    href: '/legal-case-management-tool',
    label: 'Legal case management tool',
    description: 'Understand how notes, documents, and authorities stay usable once research begins.',
  },
  {
    href: '/court-bundle-preparation-uk',
    label: 'Court bundle preparation UK',
    description: 'See how the authorities and essential documents you rely on stay tied to the hearing file.',
  },
  {
    href: '/pricing',
    label: 'Compare plans',
    description: 'Review which MyMcKenzieCS plans include broader research support and advanced case-law study features.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/case-law-search-uk',
});

export const revalidate = 86400;

export default function CaseLawSearchUkPage() {
  return (
    <GuidePage
      path="/case-law-search-uk"
      title={title}
      subtitle="A guide to official judgment search, better case-law research habits, and the way MyMcKenzieCS helps keep authorities tied to the live case."
      meta="Updated 17 March 2026 | UK judgment research | Informational only"
      intro={[
        'People searching for "case law search UK" are often trying to move from general confusion to something concrete. They want to know where the judgments are, how to search them properly, and how to stop useful authorities disappearing into disconnected tabs and notes.',
        'This page explains the official search route first and then shows how MyMcKenzieCS helps turn case-law research into organised preparation rather than one more loose thread in the case file.',
      ]}
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Keep authorities tied to the hearing file"
      ctaText="Research only helps when the useful cases, extracts, and notes remain connected to the bundle and issue list you will actually use later."
      primaryCta={{ href: '/court-bundle-preparation-uk', label: 'Prepare the bundle' }}
      secondaryCta={{ href: '/legal-case-management-tool', label: 'See the workflow' }}
    />
  );
}
