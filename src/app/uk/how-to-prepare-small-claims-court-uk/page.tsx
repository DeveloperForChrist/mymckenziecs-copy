import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'How to Prepare for Small Claims Court UK: Step by Step';
const description =
  'Learn how to prepare for a small claims court hearing in England and Wales, from claim papers and mediation to witness evidence, deadlines, and hearing-day organisation.';

const stats: GuideStat[] = [
  {
    label: 'Best for',
    value: 'People handling a county court money claim without a solicitor or barrister.',
  },
  {
    label: 'Key stages',
    value: 'Claim papers, response, mediation, directions, evidence, and the hearing.',
  },
  {
    label: 'Main goal',
    value: 'Turn scattered documents and dates into a clear file you can actually use.',
  },
  {
    label: 'Important limit',
    value: 'The live court order and deadlines in your own case always control the next step.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What preparing for small claims court actually means',
    paragraphs: [
      'Preparing for small claims court is not just about what you say on the day of the hearing. It starts much earlier, with the claim papers, the response, any mediation stage, the directions questionnaire, and the evidence you intend to rely on.',
      'GOV.UK explains that a county court money claim was often described as a small claims court case. In practice, preparation means keeping the process readable from the first papers through to the hearing rather than leaving everything to the last week.',
    ],
  },
  {
    title: 'Start with the claim papers and response timetable',
    paragraphs: [
      'The first preparation task is simply to make the case file coherent. Keep the claim, the defence or response, court notices, and any covering correspondence together so you can see what stage the case has reached and what date matters next.',
      'GOV.UK says the defendant must respond by the date given in the court letter or email. That is why small claims preparation is usually a timetable problem as much as a merits problem.',
    ],
    bullets: [
      'Keep the claim form, particulars, response, and court notices in one place.',
      'Record the next deadline as soon as a new letter or order arrives.',
      'Save proof of payment, proof of sending, and any reference numbers with the case papers.',
      'Do not rely on memory for dates that could affect the progress of the case.',
    ],
  },
  {
    title: 'Prepare your evidence early',
    paragraphs: [
      'Evidence usually becomes harder to organise when it is left until close to the hearing. If you already know which emails, invoices, screenshots, contracts, photographs, or letters matter, group them now and note why each one is relevant.',
      'This is also the stage to begin a short chronology. A hearing becomes much easier to follow when you can explain the sequence of events clearly instead of trying to reconstruct it from a pile of documents.',
    ],
    bullets: [
      'Group documents by issue, date, or event so they stay easy to explain.',
      'Write a short chronology showing what happened and when.',
      'Keep witness evidence separate from general working notes.',
      'Check whether any document still needs to be served or exchanged before the hearing.',
    ],
  },
  {
    title: 'Be ready for mediation and directions',
    paragraphs: [
      'If the claim is for £10,000 or less and the defendant disputes it, GOV.UK says you will be told you must attend court-organised mediation and that the service is free. The directions questionnaire stage often sits around this part of the process and helps the court decide what happens next.',
      'That means preparation is not just about the final hearing. It also means understanding where mediation fits, answering the directions questionnaire carefully, and keeping copies of what you send back to the court.',
    ],
  },
  {
    title: 'Build a simple hearing file for yourself',
    paragraphs: [
      'Even where the hearing is relatively informal, a self-represented user usually needs a working file they can use under pressure. The aim is not to create an elaborate bundle unless the court order requires one. The aim is to make the case readable when you need it most.',
      'A practical hearing file usually includes the latest court order, a short chronology, the key claim papers, your witness material, the documents you are relying on, and a short note of the main points you want to raise.',
    ],
    bullets: [
      'Keep the latest court order at the front of the file.',
      'Include a short chronology and a one-page note of the live issues.',
      'Bring the claim papers, witness material, and the documents you rely on.',
      'Keep any questions you want answered written down in advance.',
    ],
  },
  {
    title: 'Common mistakes before a small claims hearing',
    paragraphs: [
      'The most common preparation mistakes are usually avoidable. They happen when the case papers are not together, the chronology is unclear, or the next deadline is assumed instead of recorded.',
      'Small claims hearings are easier to manage when the preparation has already reduced the case to its essentials.',
    ],
    bullets: [
      'Leaving evidence review until the week of the hearing.',
      'Turning up without a usable chronology or note of the main issues.',
      'Bringing documents without explaining why they matter.',
      'Mixing draft notes, final documents, and correspondence together.',
      'Missing mediation or questionnaire steps because they felt less urgent than the hearing.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps with small claims preparation',
    paragraphs: [
      'MyMcKenzieCS helps because small claims work still turns into document and deadline management very quickly. A person representing themselves usually needs one place to hold the case papers, note what the court has ordered, record the next task, and preserve the context of earlier work.',
      'That makes the platform useful before mediation, before a hearing, and after each new notice arrives. Instead of recreating the case picture each time, you are working from a single organised workspace.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/uk/small-claims-court-uk',
    label: 'Small claims court UK',
    description: 'Start with the wider county court money-claim overview before working through preparation steps.',
  },
  {
    href: '/uk/directions-questionnaire-uk',
    label: 'Directions questionnaire UK',
    description: 'Understand the form stage that often shapes the timetable before the hearing.',
  },
  {
    href: '/uk/witness-statement-uk',
    label: 'Witness statement UK',
    description: 'Move from the hearing checklist into witness evidence and service questions.',
  },
  {
    href: '/uk/organise-court-documents-uk',
    label: 'How to organise court documents UK',
    description: 'Build the document system that makes small claims preparation easier to manage.',
  },
  {
    href: '/uk/court-bundle-preparation-uk',
    label: 'Court bundle preparation UK',
    description: 'See how your case papers become a paginated, indexed hearing bundle where the court requires one.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/uk/how-to-prepare-small-claims-court-uk',
});

export const revalidate = 86400;

export default function HowToPrepareSmallClaimsCourtUkPage() {
  return (
    <GuidePage
      path="/uk/how-to-prepare-small-claims-court-uk"
      title={title}
      subtitle="A practical guide to preparing your papers, evidence, deadlines, and hearing file for a small claims court case in England and Wales."
      meta="Published 27 March 2026 | England and Wales money claims focus | Informational only"
      intro={[
        'People searching for how to prepare for small claims court in the UK are usually close to a live deadline. They do not need a vague explanation of small claims. They need a practical preparation routine that keeps the case readable from claim papers to hearing day.',
        'This guide focuses on that routine. It keeps the advice procedural and organisational, and it shows where MyMcKenzieCS fits when a litigant in person needs one place to manage the case.',
      ]}
      publishedDate="2026-03-27"
      modifiedDate="2026-03-27"
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Move from checklist to hearing file"
      ctaText="Once the papers and chronology are under control, the next job is usually turning them into a bundle or at least a hearing-ready document file."
      primaryCta={{ href: '/uk/court-bundle-preparation-uk', label: 'Plan the bundle' }}
      secondaryCta={{ href: '/uk/organise-court-documents-uk', label: 'Organise documents' }}
    />
  );
}
