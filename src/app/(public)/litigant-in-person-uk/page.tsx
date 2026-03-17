import type { Metadata } from 'next';
import GuidePage, { type GuideFaqItem, type GuideLink, type GuideSection, type GuideSource, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Guide for Litigants in Person in the UK';
const description =
  'Understand what a litigant in person is, the common challenges of self-representation, and how MyMcKenzieCS helps UK court users organise documents, deadlines, and research.';

const stats: GuideStat[] = [
  {
    label: 'Who it is for',
    value: 'People handling a court case without a solicitor or barrister.',
  },
  {
    label: 'Main pressure points',
    value: 'Paperwork, evidence, orders, deadlines, and hearing preparation.',
  },
  {
    label: 'Support style',
    value: 'Practical organisation and procedural guidance, not representation.',
  },
  {
    label: 'Important limit',
    value: 'MyMcKenzieCS provides informational court support only, not legal advice.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What is a litigant in person?',
    paragraphs: [
      'A litigant in person is someone who handles their own court case without a solicitor, barrister, or other legal representative speaking for them. GOV.UK explains that you have the right to represent yourself in court, and this is the phrase the system commonly uses when that is happening.',
      'In practice, that usually means you are responsible for understanding the documents in your case, preparing what you want to say, meeting deadlines, and presenting your own position to the court. Support Through Court uses the term for people facing civil and family courts alone and focuses on helping them navigate that process more confidently.',
    ],
  },
  {
    title: 'Why self-representation feels so demanding',
    paragraphs: [
      'Most people do not struggle because they are unwilling to prepare. They struggle because court work is administrative, procedural, and emotionally heavy at the same time. You may need to understand directions, respond to the other side, organise evidence, and still keep a clear narrative of your case.',
      'Even where judges and court staff recognise that a person is unrepresented, you still need to prepare your case carefully. The workload usually grows around the same pressure points.',
    ],
    bullets: [
      'Working out which facts, issues, and documents actually matter.',
      'Keeping a usable chronology instead of losing time in scattered emails and downloads.',
      'Tracking filing dates, service dates, hearings, and follow-up tasks.',
      'Preparing forms, witness material, and hearing notes without overlooking a step.',
      'Researching procedure and authorities without drowning in irrelevant material.',
    ],
  },
  {
    title: 'What good preparation usually looks like',
    paragraphs: [
      'Good preparation is rarely dramatic. It is usually the result of having one reliable place for the case file, one clear timeline of what happened, and one running list of the issues that still need action. When those pieces are missing, people end up re-reading the same papers, missing small deadlines, or turning up to a hearing with partial notes.',
      'A workable self-represented setup usually includes a document store, a chronology, issue notes, a hearing checklist, and reminders for dates that cannot slip. That does not replace legal advice, but it does make it much easier to think clearly and ask better questions when you do need outside help.',
    ],
    bullets: [
      'Keep pleadings, letters, orders, and evidence in one place.',
      'Record the sequence of events and what each document proves.',
      'Write down the questions you still need answered on procedure or evidence.',
      'Break the next court step into tasks instead of leaving it as one vague problem.',
      'Review deadlines early enough to avoid rushed filings or service mistakes.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps litigants in person',
    paragraphs: [
      'MyMcKenzieCS is built as a legal self-help workspace for UK litigants in person. Instead of treating your case as a loose collection of emails, scans, and calendar alerts, it gives you one place to keep documents, reminders, notes, and research support together.',
      'That matters because self-representation is often lost in the handover between tasks. You read a document in one place, note a deadline in another, save a case citation somewhere else, and then have to rebuild the picture before every hearing. MyMcKenzieCS is designed to reduce that friction.',
    ],
    bullets: [
      'Document and evidence organisation in one workspace.',
      'Conversation history so earlier guidance does not disappear.',
      'Scheduled reminder emails on paid plans before saved case events.',
      'Source-backed web research support to help you understand procedure and context.',
      'Advanced case law retrieval and study on Premium + for deeper authority work.',
    ],
    note: 'You remain responsible for your case, filings, and decisions. A case-management tool can improve clarity and consistency, but it does not become your lawyer or representative.',
  },
  {
    title: 'Where to get extra help when you need it',
    paragraphs: [
      'If you can get legal advice on a specific issue, do it. A short paid review of a draft order, defence, witness statement, or hearing strategy can save more time than hours of unguided searching. If paying for a lawyer is not realistic, check whether you qualify for legal aid or free help from charities and pro bono schemes.',
      'Support Through Court may be especially useful if you need practical help with forms, papers, or talking through next steps. If you are also considering a lay supporter at a hearing, read the separate guide on McKenzie friend support so you are clear about what that role can and cannot do.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/witness-statement-uk',
    label: 'Witness statement UK',
    description: 'Learn how factual evidence is structured, served, and kept tied to the live case file.',
  },
  {
    href: '/directions-questionnaire-uk',
    label: 'Directions questionnaire UK',
    description: 'Understand the N180 and N181 stage and how it shapes the case timetable.',
  },
  {
    href: '/small-claims-court-uk',
    label: 'Small claims court UK',
    description: 'See how lower-value county court money claims usually progress from claim to mediation and hearing.',
  },
  {
    href: '/serving-court-documents-uk',
    label: 'Serving court documents',
    description: 'Learn the basics of service, addresses for service, and Form N215.',
  },
  {
    href: '/mckenzie-friend-support',
    label: 'McKenzie friend support',
    description: 'Understand what a McKenzie friend can do at court and where a digital tool fits beside that role.',
  },
  {
    href: '/case-law-search-uk',
    label: 'Case law search UK',
    description: 'Learn how to search judgments more efficiently and turn research into usable case preparation.',
  },
];

const faqItems: GuideFaqItem[] = [
  {
    question: 'What does "litigant in person" mean in the UK?',
    answer:
      'It means you are handling your own court case without a solicitor, barrister, or other legal representative speaking for you. In England and Wales, GOV.UK says you have the right to speak for yourself in court.',
  },
  {
    question: 'Can I represent myself in court in England and Wales?',
    answer:
      'Yes. GOV.UK says you have the right to speak for yourself in court without a solicitor or other legal professional. This page is focused on civil self-representation in England and Wales; Scotland and Northern Ireland have different processes.',
  },
  {
    question: 'Should I check for legal aid before trying to do everything myself?',
    answer:
      'Yes. GOV.UK says that if you are considering representing yourself in a civil case because you cannot afford legal costs, you should check whether you can get legal aid. The online checker asks about your legal problem, income, and savings, but it only gives guidance until you speak to an adviser.',
  },
  {
    question: 'Can I have a McKenzie friend with me in court?',
    answer:
      'Often yes, but it is not automatic. GOV.UK says you may be allowed to have someone with you to take notes and give advice, but they cannot speak for you, interfere with proceedings, or sign documents on your behalf. The judge decides whether you can have a McKenzie friend with you.',
  },
  {
    question: 'Is "small claims court" a separate court?',
    answer:
      'Not usually in the way people mean it. GOV.UK explains that making a county court claim for money was often described as going to a "small claims court". In practice, "small claims" is usually about the track or type of case management rather than a completely separate court building or system.',
  },
  {
    question: 'What is a directions questionnaire?',
    answer:
      'It is a form the court sends so the judge can decide the next case-management steps, called directions. HMCTS says Form N180 is used in small claims cases, while Form N181 is used for fast track, intermediate track, or multi-track disputes.',
  },
  {
    question: 'What is the difference between Form N180 and Form N181?',
    answer:
      'HMCTS says N180 is the directions questionnaire for the small claims track. N181 is the directions questionnaire for fast track, intermediate track, or multi-track cases, and it is sent to the claimant or defendant if they are not using a legal representative.',
  },
  {
    question: 'How should I prepare a witness statement?',
    answer:
      'The civil procedure guidance says a witness statement should start with the case name and claim number, give the witness full name and address, set out the evidence clearly in numbered paragraphs on numbered pages, end with the statement of truth, and be signed and dated.',
  },
  {
    question: 'Do I send my witness statement to the court or to the other side first?',
    answer:
      'The standard civil directions explain that parties usually have to serve signed witness statements on each other by the deadline in the order. The guidance specifically says copies should be sent to the other party or parties, not to the court at that stage.',
  },
  {
    question: 'How do I prove that I served documents?',
    answer:
      'HMCTS provides Form N215 for this. GOV.UK says it is used to tell the civil court which documents you served, who you served them on, and when, where, and how you served them. The completed certificate then has to be delivered to the court dealing with the claim.',
  },
  {
    question: 'Can a small claim require mediation?',
    answer:
      'Yes. GOV.UK says that if you are making a money claim of GBP10,000 or less and the defendant disputes it, you will be told you must attend mediation organised by the court, and that service is free. For larger claims, the court may offer mediation or you can arrange it privately.',
  },
  {
    question: 'How can I search case law in the UK?',
    answer:
      'A strong official starting point is The National Archives Find Case Law service. It says you can search by keyword or neutral citation and use names and keywords. It also explains that the service provides free access to many judgments made publicly available in digital form, but not every lower-court decision is written down or transcribed.',
  },
  {
    question: 'Where can I get practical help if I cannot afford a lawyer?',
    answer:
      'Support Through Court is one of the clearest places to start in England and Wales. Its National Helpline says it offers emotional and practical support, plus some help with completing court forms, for people facing civil and family courts without representation. It also says it cannot give legal advice.',
  },
];

const sources: GuideSource[] = [
  {
    href: 'https://www.gov.uk/represent-yourself-in-court',
    label: 'GOV.UK: Represent yourself in court',
    description: 'Official overview explaining that you may speak for yourself in court and outlining the basics of self-representation.',
  },
  {
    href: 'https://www.gov.uk/check-legal-aid',
    label: 'GOV.UK: Check if you can get legal aid',
    description: 'Official public checker for civil legal aid eligibility guidance before speaking to an adviser.',
  },
  {
    href: 'https://www.gov.uk/make-court-claim-for-money',
    label: 'GOV.UK: Make a court claim for money',
    description: 'Explains county court money claims, the older "small claims court" label, and the wider process around civil money claims.',
  },
  {
    href: 'https://www.gov.uk/make-court-claim-for-money/mediation',
    label: 'GOV.UK: Resolve your claim through mediation',
    description: 'Official guidance on when court-organised mediation is required or offered in money claims.',
  },
  {
    href: 'https://www.gov.uk/government/publications/form-n180-directions-questionnaire-small-claims-track',
    label: 'HMCTS: Form N180',
    description: 'Official directions questionnaire page for small claims track cases.',
  },
  {
    href: 'https://www.gov.uk/government/publications/form-n181-directions-questionnaire-fast-track-and-multi-track',
    label: 'HMCTS: Form N181',
    description: 'Official directions questionnaire page for fast track, intermediate track, and multi-track disputes.',
  },
  {
    href: 'https://www.justice.gov.uk/courts/procedure-rules/civil/standard-directions/general/witness-statements',
    label: 'Justice UK: Witness statement layout',
    description: 'Official civil procedure guidance showing the standard elements a witness statement should include.',
  },
  {
    href: 'https://www.justice.gov.uk/courts/procedure-rules/civil/standard-directions/general/evidence',
    label: 'Justice UK: Factual evidence standard directions',
    description: 'Explains the standard direction for serving signed witness statements on the other side by the deadline.',
  },
  {
    href: 'https://www.gov.uk/government/publications/form-n215-certificate-of-service',
    label: 'HMCTS: Form N215',
    description: 'Official certificate of service form for telling the court which documents were served, on whom, and how.',
  },
  {
    href: 'https://caselaw.nationalarchives.gov.uk/',
    label: 'The National Archives: Find Case Law',
    description: 'Official UK judgment search service for England and Wales plus UK Supreme Court and Privy Council material.',
  },
  {
    href: 'https://supportthroughcourt.org/locations/national-helpline/',
    label: 'Support Through Court: National Helpline',
    description: 'Practical and emotional support for people facing civil and family courts without a lawyer in England and Wales.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/litigant-in-person-uk',
});

export const revalidate = 86400;

export default function LitigantInPersonUkPage() {
  return (
    <GuidePage
      path="/litigant-in-person-uk"
      title={title}
      subtitle="If you are going to court without legal representation, this guide explains the role, the pressure points, and the preparation habits that matter most."
      meta="Updated 17 March 2026 | England and Wales focus | Informational only"
      intro={[
        'People search for help with "litigant in person UK" when they are already carrying the weight of a live court problem. They usually do not need abstract legal jargon first. They need clarity about what the term means, what the court will expect, and how to keep the case from becoming administratively overwhelming.',
        'This page is written for that moment. It explains the role of a litigant in person in the UK, the common difficulties of self-representation, and how MyMcKenzieCS helps you keep a case organised without pretending to replace a lawyer.',
      ]}
      stats={stats}
      sections={sections}
      faqItems={faqItems}
      faqTitle="Questions UK litigants in person commonly ask"
      faqIntro="This section is designed to capture the real search queries people use when they are trying to manage a case without representation. The answers stay high level and procedural, and they point back to official sources where the next step matters."
      relatedLinks={relatedLinks}
      sources={sources}
    />
  );
}
