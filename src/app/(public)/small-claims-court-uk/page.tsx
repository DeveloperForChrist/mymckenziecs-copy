import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideSource, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Small Claims Court UK: What Litigants in Person Should Expect';
const description =
  'Understand what people mean by small claims court in England and Wales, how a money claim usually starts, where mediation and directions questionnaires fit, and how MyMcKenzieCS helps keep the process organised.';

const stats: GuideStat[] = [
  {
    label: 'Usual meaning',
    value: 'A county court money-claim process often described as the small claims track.',
  },
  {
    label: 'Starting point',
    value: 'A person or business can apply to a county court to claim money owed.',
  },
  {
    label: 'Mediation',
    value: 'Disputed money claims of GBP10,000 or less are usually sent to court-organised mediation.',
  },
  {
    label: 'Important limit',
    value: 'Small claims procedure is still formal court process with deadlines, evidence, and hearing preparation.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What people usually mean by "small claims court"',
    paragraphs: [
      'GOV.UK explains that applying to a county court to claim money was often known as taking someone to a "small claims court". In practice, the phrase is commonly used as shorthand for lower-value county court money disputes rather than a completely separate court system.',
      'That distinction matters because self-represented users often search for small claims court when what they really need is help with the county court money-claim process, deadlines, evidence, and settlement options.',
    ],
  },
  {
    title: 'How a money claim usually starts',
    paragraphs: [
      'GOV.UK says you can apply to a county court to claim money you are owed by a person or business. The claim can usually be made online, although there are cases where you need to use paper forms instead, for example if you do not know the amount you are claiming.',
      'Once the claim has been made, GOV.UK says the defendant receives the claim and must respond by the date in the letter or email. That means the process quickly becomes a timetable question as much as a merits question.',
    ],
  },
  {
    title: 'Where mediation and the directions questionnaire fit',
    paragraphs: [
      'On disputed money claims of GBP10,000 or less, GOV.UK says the parties will be told they must attend mediation organised by the court, and that this service is free. The directions questionnaire stage often sits around this part of the process and helps the court decide what directions to give next.',
      'That is why small claims cases still demand organisation. Even though the process is designed to be more accessible than higher-track litigation, there are still formal steps, documents, and deadlines that can create pressure for litigants in person.',
    ],
  },
  {
    title: 'What to stay on top of as a litigant in person',
    paragraphs: [
      'People often underestimate small claims because the name sounds informal. The reality is that even a relatively small money dispute can involve pleadings, service, mediation, witness statements, and a final hearing. The process is usually simpler than larger civil litigation, but it is still a court process.',
      'The practical challenge is rarely one single document. It is the accumulation of forms, dates, evidence, and communications that have to remain coherent across weeks or months.',
    ],
    bullets: [
      'Record the date the claim or response was served and the deadline that follows.',
      'Keep copies of the claim, response, and all court notices together.',
      'Track whether mediation is required or offered.',
      'Prepare witness evidence and documents early rather than in a rush.',
      'Keep a short chronology so the dispute remains easy to explain.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps with small claims preparation',
    paragraphs: [
      'MyMcKenzieCS helps because small claims work still turns into document and deadline management very quickly. A person representing themselves usually needs one place to hold the case papers, note what the court has ordered, record the next task, and preserve the context of earlier work.',
      'That makes the platform useful before mediation, before a hearing, and after each new notice arrives. Instead of recreating the whole case picture each time, you are working from a single organised workspace.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/litigant-in-person-uk',
    label: 'Guide for litigants in person',
    description: 'Return to the main hub for the wider picture of self-representation in England and Wales.',
  },
  {
    href: '/directions-questionnaire-uk',
    label: 'Directions questionnaire UK',
    description: 'Understand the form stage that often follows once a small money dispute is defended.',
  },
  {
    href: '/witness-statement-uk',
    label: 'Witness statement UK',
    description: 'Move from the claim stage into evidence preparation and statement deadlines.',
  },
];

const sources: GuideSource[] = [
  {
    href: 'https://www.gov.uk/make-court-claim-for-money',
    label: 'GOV.UK: Make a court claim for money',
    description: 'Official guide explaining what a county court money claim is and the older "small claims court" wording.',
  },
  {
    href: 'https://www.gov.uk/make-court-claim-for-money/after-you-make-your-claim',
    label: 'GOV.UK: After you make your claim',
    description: 'Official guidance on what happens after a money claim is issued and how the defendant responds.',
  },
  {
    href: 'https://www.gov.uk/make-court-claim-for-money/mediation',
    label: 'GOV.UK: Resolve your claim through mediation',
    description: 'Official mediation guidance for disputed money claims, including the court-organised service.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/small-claims-court-uk',
});

export const revalidate = 86400;

export default function SmallClaimsCourtUkPage() {
  return (
    <GuidePage
      path="/small-claims-court-uk"
      title={title}
      subtitle="A practical guide to what the phrase usually means, how the county court money-claim process works, and where organisation matters most for self-represented users."
      meta="Updated 17 March 2026 | England and Wales money claims focus | Informational only"
      intro={[
        'Searches for "small claims court UK" often come from people who want a simple route through a money dispute. What they usually need is not a slogan about small claims. They need a plain-English map of what the county court process involves once a claim is live.',
        'This page explains that process at a high level and shows where MyMcKenzieCS fits when a litigant in person needs to keep the case organised from claim to hearing.',
      ]}
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      sources={sources}
    />
  );
}
