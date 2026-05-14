import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'U.S. Case-Law Research Guide for Self-Represented Litigants';
const description =
  'Learn how to approach U.S. case-law research, use official opinion sources, track court level, and keep research tied to your live case file.';

const stats: GuideStat[] = [
  {
    label: 'Federal opinions',
    value: 'Many federal court opinions can be searched through PACER and related public access tools.',
  },
  {
    label: 'State opinions',
    value: 'State appellate and supreme court opinions are often published through official judiciary sites or official reports services.',
  },
  {
    label: 'Main caution',
    value: 'Court level, publication status, and citation rules can vary by jurisdiction.',
  },
  {
    label: 'Best workflow',
    value: 'Keep research notes attached to the issues, documents, and timeline they relate to.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'Why U.S. case-law research feels harder than people expect',
    paragraphs: [
      'Many self-represented users start with a general search engine and quickly end up with commentary, secondary explanations, or cases from the wrong court level. The problem is not only finding words that sound similar. It is finding authority from the right court, in the right jurisdiction, with the right status.',
      'That is why the first research question is often structural: state or federal, trial or appellate, published or unpublished, and whether the case is even in the same legal system as the dispute you are handling.',
    ],
  },
  {
    title: 'Where to start with official sources',
    paragraphs: [
      'For federal opinions, PACER offers access to court opinions, and many opinions are also available through public-access partnerships linked from the federal courts system. For state matters, many appellate and supreme courts publish opinions through official judiciary websites or official reports services.',
      'The exact search tool differs by jurisdiction, which is why local official court websites matter so much. A good starting habit is to look for the court’s own opinions page or official reports page before relying on third-party summaries.',
    ],
  },
  {
    title: 'What to watch when you find a case',
    paragraphs: [
      'Finding a case is only the first step. You still need to check the court level, the date, whether the opinion is published or citable where that distinction matters, and whether the issue really matches the one you are researching.',
      'That is especially important in the United States because state systems differ, and not every opinion carries the same weight everywhere.',
    ],
    bullets: [
      'Check whether the case is state or federal before you treat it as useful.',
      'Check the court level before assuming the decision is strongly persuasive.',
      'Notice whether the opinion is published, citable, or merely informative in your jurisdiction.',
      'Keep a note on why the case may matter instead of saving a citation with no context.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps with research discipline',
    paragraphs: [
      'MyMcKenzieCS helps because research becomes more useful when it stays attached to the live case. Instead of finding an opinion and then losing the reason it mattered, you can keep your notes, questions, and case documents in the same workspace.',
      'That matters even more in a U.S. setting where jurisdiction can shift the value of a case quickly. The research note is often as important as the citation itself.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/us/self-represented-litigant-guide',
    label: 'U.S. self-represented litigant guide',
    description: 'Return to the wider guide for handling your own case and keeping the process understandable.',
  },
  {
    href: '/us/legal-case-management-tool',
    label: 'Legal case management tool',
    description: 'See how case-law research fits into the same workflow as documents and deadlines.',
  },
  {
    href: '/us/organize-court-documents',
    label: 'How to organize court documents',
    description: 'Keep authority research connected to the filings and exhibits it relates to.',
  },
  {
    href: '/us/pricing',
    label: 'U.S. pricing',
    description: 'See which plans include broader research support as the U.S. rollout continues.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/us/case-law-research',
});

export const revalidate = 86400;

export default function UsCaseLawResearchPage() {
  return (
    <GuidePage
      path="/us/case-law-research"
      title={title}
      subtitle="A practical guide to official opinions, court level, jurisdiction, and keeping research attached to the live case."
      meta="Updated 20 April 2026 | U.S. opinion research | Informational only"
      intro={[
        'People searching for U.S. case law often want to move from general confusion to something concrete. They want to know where opinions actually are, how to search them more carefully, and how to stop useful authority from disappearing into disconnected tabs.',
        'This page focuses on that practical problem. It explains where official sources often sit and how MyMcKenzieCS helps keep research tied to the case file instead of becoming one more loose thread.',
      ]}
      publishedDate="2026-04-20"
      modifiedDate="2026-04-20"
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Keep authority tied to the case file"
      ctaText="Research helps most when the useful opinions, extracts, and notes stay connected to the pleadings, exhibits, and questions you are actually working with."
      primaryCta={{ href: '/us/legal-case-management-tool', label: 'See the workflow' }}
      secondaryCta={{ href: '/us/pricing', label: 'Compare plans' }}
    />
  );
}
