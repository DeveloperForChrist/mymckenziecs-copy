import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideSource, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Directions Questionnaire UK: N180 and N181 Explained';
const description =
  'Understand what a directions questionnaire is, when courts use Form N180 or N181, how mediation fits in, and how MyMcKenzieCS helps litigants in person keep track of deadlines and case steps.';

const stats: GuideStat[] = [
  {
    label: 'Purpose',
    value: 'Gives the court information so the judge can set case-management directions.',
  },
  {
    label: 'N180',
    value: 'Used for small claims track disputes.',
  },
  {
    label: 'N181',
    value: 'Used for fast track, intermediate track, or multi-track disputes.',
  },
  {
    label: 'Important limit',
    value: 'The form does not decide the case merits; it helps shape the procedure and next steps.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What a directions questionnaire is',
    paragraphs: [
      'A directions questionnaire is part of civil case management. HMCTS says the form is used so the judge can give instructions, called directions, to the parties. In practical terms, it is one of the points where the case moves from bare dispute into a structured court timetable.',
      'For litigants in person, the directions questionnaire matters because it usually arrives when the case is becoming more formal. Missing the deadline or answering it carelessly can create avoidable problems later, even though the form itself is procedural rather than substantive.',
    ],
  },
  {
    title: 'What is the difference between N180 and N181?',
    paragraphs: [
      'HMCTS says Form N180 is for disputes in the small claims track. Form N181 is for disputes in the fast track, intermediate track, or multi-track. The court sends the relevant form to the claimant or defendant if they are not using a legal representative.',
      'That difference matters because the forms sit inside different levels of case complexity. A person searching for directions questionnaire help often first needs to confirm which form they have actually received and what kind of track the court is considering.',
    ],
  },
  {
    title: 'Where mediation fits in',
    paragraphs: [
      'On lower-value money claims, mediation now matters earlier and more directly than many people expect. GOV.UK says that if a money claim of GBP10,000 or less is disputed, the parties will be told they must attend mediation organised by the court, and that this service is free.',
      'That means the directions questionnaire stage is not just paperwork. It often sits close to decisions about whether the case can settle, how much court resource it needs, and what timetable the court should impose if settlement does not happen.',
    ],
  },
  {
    title: 'How to approach the form as a litigant in person',
    paragraphs: [
      'The safest approach is procedural discipline. Read the accompanying notice, check which form number you have, answer what is actually asked, and keep a copy of everything you send. A directions questionnaire is not the place to argue every factual dispute in full. It is the place to give the court usable case-management information.',
      'If you are unsure about a question, it is often better to pause and read the official guidance note or the form itself carefully rather than guess. The court is using the information to organise the next stage of the case, not to reward dramatic drafting.',
    ],
    bullets: [
      'Check the deadline immediately and record it somewhere reliable.',
      'Confirm whether you have N180 or N181 before completing the form.',
      'Keep the answers accurate and procedural rather than argumentative.',
      'Save the completed form and any covering message or proof of sending.',
      'Note what the next likely stage will be after the form is returned.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps with directions questionnaires',
    paragraphs: [
      'Directions questionnaires are exactly the kind of stage where a litigant in person benefits from having one organised workspace. The problem is usually not the existence of the form itself. The problem is that the form arrives when the case already has papers, deadlines, and unresolved questions scattered across too many places.',
      'MyMcKenzieCS helps by keeping the procedural guidance, document context, and next-step planning tied together. That makes it easier to answer the form consistently and then follow through on the timetable that comes after it.',
    ],
    bullets: [
      'Keep the questionnaire, order, and related case notes together.',
      'Track mediation, hearing, and filing dates from one workspace.',
      'Preserve earlier research and guidance instead of restarting each time a new form arrives.',
      'Use reminder workflows so procedural deadlines stay visible.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/litigant-in-person-uk',
    label: 'Guide for litigants in person',
    description: 'Return to the main self-representation hub for the wider civil-court workflow.',
  },
  {
    href: '/small-claims-court-uk',
    label: 'Small claims court UK',
    description: 'See where N180 and court-organised mediation usually fit into lower-value money disputes.',
  },
  {
    href: '/witness-statement-uk',
    label: 'Witness statement UK',
    description: 'Follow the process forward into evidence preparation once directions have been set.',
  },
];

const sources: GuideSource[] = [
  {
    href: 'https://www.gov.uk/government/publications/form-n180-directions-questionnaire-small-claims-track',
    label: 'HMCTS: Form N180',
    description: 'Official small claims directions questionnaire page.',
  },
  {
    href: 'https://www.gov.uk/government/publications/form-n181-directions-questionnaire-fast-track-and-multi-track',
    label: 'HMCTS: Form N181',
    description: 'Official directions questionnaire page for fast track, intermediate track, and multi-track disputes.',
  },
  {
    href: 'https://www.gov.uk/make-court-claim-for-money/mediation',
    label: 'GOV.UK: Resolve your claim through mediation',
    description: 'Official guidance on mandatory or offered mediation in money claims.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/directions-questionnaire-uk',
});

export const revalidate = 86400;

export default function DirectionsQuestionnaireUkPage() {
  return (
    <GuidePage
      path="/directions-questionnaire-uk"
      title={title}
      subtitle="A practical guide to what the questionnaire does, how N180 differs from N181, and how to stay organised around the case-management stage."
      meta="Updated 17 March 2026 | England and Wales civil focus | Informational only"
      intro={[
        'Searches for "directions questionnaire UK" usually come from people who have just received one and do not want to make a procedural mistake. They need to know what the form is for, whether they have N180 or N181, and what this means for the next stage of the case.',
        'This page explains that stage clearly and links it back to the broader realities of self-representation and case organisation.',
      ]}
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      sources={sources}
    />
  );
}
