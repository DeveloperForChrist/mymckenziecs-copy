import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Do You Need a Lawyer for Small Claims Court UK?';
const description =
  'Understand when people handle small claims without a lawyer in England and Wales, what self-representation involves, and where legal advice or courtroom help may still be useful.';

const stats: GuideStat[] = [
  {
    label: 'Default position',
    value: 'You can represent yourself in court if there is a small claims hearing.',
  },
  {
    label: 'Often used for',
    value: 'Lower-value county court money disputes where full representation may cost more than the claim justifies.',
  },
  {
    label: 'Other support',
    value: 'A solicitor, barrister, adviser in court, or someone who may speak with the court’s permission.',
  },
  {
    label: 'Important limit',
    value: 'Going without a lawyer may reduce cost, but it does not remove the workload of preparing the case properly.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'Do you need a lawyer for small claims court?',
    paragraphs: [
      'Not always. GOV.UK says that if there is a hearing, you can represent yourself. That is one reason small claims are commonly handled without a solicitor or barrister speaking for the party throughout the case.',
      'The real question is usually not whether a lawyer is legally required. It is whether the dispute, the amount at stake, and the complexity of the evidence make full representation worthwhile for your situation.',
    ],
  },
  {
    title: 'Why people handle small claims without a lawyer',
    paragraphs: [
      'Cost is the most obvious reason. In lower-value money disputes, the price of full legal representation can feel disproportionate to the claim value. GOV.UK also says some people choose to speak for themselves directly.',
      'That does not mean the process is effortless. It only means that self-representation is common enough for many small claims users to look for structured preparation rather than full representation from the start.',
    ],
  },
  {
    title: 'When legal advice may still be worth paying for',
    paragraphs: [
      'A person may not need a lawyer for the whole claim, but a targeted paid review can still be valuable. That is often true where the dispute turns on a difficult legal issue, weak or conflicting evidence, an unusual defence, or a draft statement that needs checking before it is served.',
      'If the main issue is affordability rather than preference, GOV.UK says you can use the legal-aid checker to see whether support may be available and what information the service uses.',
    ],
  },
  {
    title: 'What you still need to do if you go without a lawyer',
    paragraphs: [
      'Even in small claims, self-representation still means managing the court process. The hearing is only one part of the work. The case usually also involves paperwork, evidence, mediation, deadlines, and the discipline of keeping the file readable.',
      'That is why the practical burden often matters more than the legal label. People can represent themselves, but they still need a system.',
    ],
    bullets: [
      'Keep the claim papers, response, and court notices together.',
      'Track mediation, directions questionnaires, and hearing dates.',
      'Organise witness material and supporting documents early.',
      'Keep proof of service, proof of filing, and payment receipts where relevant.',
      'Prepare a short chronology and note of the points you want to raise at the hearing.',
    ],
  },
  {
    title: 'What help you can still have in court',
    paragraphs: [
      'GOV.UK says you can pay for a solicitor or barrister to represent you, ask someone to advise you in court even if they are not a lawyer, or ask someone to speak on your behalf if the court allows it. That means the choice is not always between full representation and total isolation.',
      'It is often possible to combine self-representation with limited outside help, whether that is a paid review of a document, a McKenzie friend in a permitted role, or someone helping you stay organised before the hearing.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps if you are preparing without a lawyer',
    paragraphs: [
      'MyMcKenzieCS helps where the main problem is structure. It gives litigants in person one place for documents, notes, reminders, and research support so the case can be prepared consistently instead of in disconnected bursts.',
      'That makes it useful if you are representing yourself in a small claim but still want a clear preparation system around the court process.',
    ],
  },
  {
    title: 'The practical takeaway',
    paragraphs: [
      'You may not need a lawyer to bring or defend a small claim, but you do need a way to stay organised. The better question is often: what parts of this case can I realistically prepare myself, and where would limited professional input save time or reduce risk?',
      'If you know the answer is no lawyer for now, the next step is not to guess your way through the process. It is to build a file, a chronology, and a deadline system that keep the case manageable.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/small-claims-court-uk',
    label: 'Small claims court UK',
    description: 'See the wider county court money-claim process that sits behind the question of representation.',
  },
  {
    href: '/how-to-prepare-small-claims-court-uk',
    label: 'How to prepare for small claims court UK',
    description: 'Move from the representation question into the practical preparation checklist.',
  },
  {
    href: '/litigant-in-person-uk',
    label: 'Litigant in person UK',
    description: 'Return to the broader self-representation guide for England and Wales.',
  },
  {
    href: '/organise-court-documents-uk',
    label: 'How to organise court documents UK',
    description: 'Build the case file that makes self-representation more manageable.',
  },
  {
    href: '/court-bundle-preparation-uk',
    label: 'Court bundle preparation UK',
    description: 'See what often happens next when your file has to become a hearing bundle.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/do-you-need-a-lawyer-for-small-claims-court-uk',
});

export const revalidate = 86400;

export default function DoYouNeedALawyerForSmallClaimsCourtUkPage() {
  return (
    <GuidePage
      path="/do-you-need-a-lawyer-for-small-claims-court-uk"
      title={title}
      subtitle="A practical guide to when people handle small claims without a lawyer, what self-representation still involves, and where outside help may be worth adding."
      meta="Published 27 March 2026 | England and Wales money claims focus | Informational only"
      intro={[
        'People searching whether they need a lawyer for small claims court in the UK are usually trying to make a cost-and-risk decision fast. They want to know whether self-representation is realistic and what work still sits on their side of the table if they go ahead alone.',
        'This guide answers that at a practical level. It stays close to the official hearing guidance and then turns the answer into an organisation question, because that is where many self-represented cases actually become difficult.',
      ]}
      publishedDate="2026-03-27"
      modifiedDate="2026-03-27"
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="If you go without a lawyer, use a tighter system"
      ctaText="Self-representation is usually manageable only when the papers, chronology, and next hearing steps stop living in separate places."
      primaryCta={{ href: '/how-to-prepare-small-claims-court-uk', label: 'Follow the checklist' }}
      secondaryCta={{ href: '/organise-court-documents-uk', label: 'Organise documents' }}
    />
  );
}
