import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'McKenzie Friend Support for UK Litigants in Person';
const description =
  'Learn what a McKenzie friend can and cannot do in court, when judges may allow one, and how MyMcKenzieCS helps with preparation, documents, and hearing organisation.';

const stats: GuideStat[] = [
  {
    label: 'Court role',
    value: 'A lay supporter who may assist a litigant in person at a hearing.',
  },
  {
    label: 'Can do',
    value: 'Provide moral support, take notes, help with papers, and quietly give suggestions.',
  },
  {
    label: 'Cannot do',
    value: 'Conduct litigation or speak for you without the court allowing it.',
  },
  {
    label: 'Important limit',
    value: 'MyMcKenzieCS is not a McKenzie friend, solicitor, or barrister.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What a McKenzie friend is',
    paragraphs: [
      'A McKenzie friend is a layperson who may assist a litigant in person. GOV.UK and the Judiciary both describe the role as reasonable assistance for someone who is representing themselves. That means the litigant remains the person conducting the case, even when someone supportive is sitting beside them.',
      'People often look for McKenzie friend support because they want another pair of eyes, help keeping calm, and practical assistance with papers and questions during a hearing. That can be helpful, but it is a narrower role than many people first assume.',
    ],
  },
  {
    title: 'What a McKenzie friend may and may not do',
    paragraphs: [
      'Official guidance is relatively consistent on the core point: a McKenzie friend may help, but they do not automatically become your advocate. The litigant in person is still the person expected to present the case unless the court gives specific permission for more.',
      'That distinction matters because people sometimes search for a McKenzie friend when what they really need is either legal representation or a better preparation system between hearings.',
    ],
    bullets: [
      'They may provide moral support, take notes, help with case papers, and quietly give advice or prompts.',
      'They do not have an automatic right to address the court, make submissions, examine witnesses, or sign documents for you.',
      'They do not take over the litigation outside court unless the court grants rights that are only given exceptionally.',
      'You should tell the court if you want a McKenzie friend present, especially where the hearing is private or permission needs to be considered.',
    ],
    note: 'If a person is going to speak for you, sign documents for you, or run the case for you, you are outside the ordinary McKenzie friend role and into a different legal question entirely.',
  },
  {
    title: 'Why people still need digital support between hearings',
    paragraphs: [
      'Even a very good McKenzie friend is usually there for a limited part of the process. Most of the work of self-representation happens before and after the hearing: reading orders, sorting exhibits, building timelines, drafting notes, checking what the next application requires, and remembering service or filing deadlines.',
      'That is why many litigants in person need a preparation system as much as they need moral support. If the case materials stay disorganised, the hearing support arrives too late to fix the underlying problem.',
    ],
  },
  {
    title: 'How MyMcKenzieCS fits beside self-representation',
    paragraphs: [
      'MyMcKenzieCS does not act as a McKenzie friend and should not be described as one. It does not attend court, speak for you, or take over the conduct of litigation. What it does provide is the part many self-represented users struggle to build for themselves: an organised digital workspace for the live case.',
      'That makes it useful before a hearing, after a hearing, and between directions. You can centralise the papers, keep your note of what the judge ordered, track follow-up tasks, and keep your research tied to the actual issues in your case.',
    ],
    bullets: [
      'Store and review documents in one place instead of across inboxes and downloads.',
      'Keep a running note of questions, issues, and hearing points you want to raise.',
      'Track deadlines and receive reminder emails on paid plans for saved case events.',
      'Use source-cited research support when you need procedural context or explanation.',
      'Move from loose preparation to a repeatable workflow you can revisit before each hearing.',
    ],
  },
  {
    title: 'A practical checklist before the next hearing',
    paragraphs: [
      'If you expect to have a McKenzie friend or any other supporter with you, treat the hearing like a coordinated preparation exercise. That means deciding in advance what documents matter, what the live issues are, and what you want to ask or say.',
      'The clearer your preparation is, the more useful any supporter becomes because they are helping with a structured case rather than trying to decipher a pile of last-minute papers.',
    ],
    bullets: [
      'Prepare a short chronology and issue list.',
      'Keep the latest orders, application notices, and evidence together.',
      'Write down the points you want to make and the questions you need answered.',
      'Make sure you know what the court has listed the hearing for.',
      'If relevant, tell the court in advance or at the start that you want a McKenzie friend present.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/litigant-in-person-uk',
    label: 'Guide for litigants in person',
    description: 'Start with the wider self-representation picture before narrowing down hearing support.',
  },
  {
    href: '/court-bundle-preparation-uk',
    label: 'Court bundle preparation UK',
    description: 'Build the hearing papers that make any supporter more useful on the day.',
  },
  {
    href: '/legal-case-management-tool',
    label: 'Legal case management tool',
    description: 'See how document control, reminders, and issue tracking reduce the load between hearings.',
  },
  {
    href: '/pricing',
    label: 'Compare MyMcKenzieCS plans',
    description: 'Review the plans that add reminder emails, expanded research, and advanced case-law study tools.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/mckenzie-friend-support',
});

export const revalidate = 86400;

export default function McKenzieFriendSupportPage() {
  return (
    <GuidePage
      path="/mckenzie-friend-support"
      title={title}
      subtitle="A clear guide to the McKenzie friend role, its limits, and the difference between courtroom support and day-to-day case organisation."
      meta="Updated 17 March 2026 | Civil and family court guidance | Informational only"
      intro={[
        '"McKenzie friend support" is a high-intent search because it usually comes from someone who already knows they will have to speak for themselves in court. The problem is that the phrase can be misunderstood. Some people expect a McKenzie friend to act like a lawyer; official guidance does not support that assumption.',
        'This page explains the role carefully. It also explains where a digital case workspace helps, because much of the burden in self-representation sits outside the hearing itself.',
      ]}
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Give any supporter a usable hearing file"
      ctaText="A McKenzie friend can only help effectively if the case papers, chronology, issues, and next hearing steps are already organised."
      primaryCta={{ href: '/court-bundle-preparation-uk', label: 'Prepare the bundle' }}
      secondaryCta={{ href: '/organise-court-documents-uk', label: 'Organise documents' }}
    />
  );
}
