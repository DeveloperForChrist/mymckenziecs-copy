import type { Metadata } from 'next';
import GuidePage, { type GuideFaqItem, type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Litigant in Person UK: Rights, Preparation and Common Mistakes';
const description =
  'Learn what a litigant in person is in England and Wales, what rights self-represented court users have, how to prepare a case, and where MyMcKenzieCS fits.';

const stats: GuideStat[] = [
  {
    label: 'Meaning',
    value: 'Someone handling their own court case without a solicitor or barrister speaking for them.',
  },
  {
    label: 'Why people do it',
    value: 'Cost, lower-value disputes, or a choice to speak for themselves directly.',
  },
  {
    label: 'What usually matters most',
    value: 'Document control, chronology, deadlines, evidence, and hearing preparation.',
  },
  {
    label: 'Important limit',
    value: 'MyMcKenzieCS provides informational court support only, not legal advice or representation.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'What is a litigant in person?',
    paragraphs: [
      'A litigant in person is someone who handles their own court case without a solicitor, barrister, or other legal representative speaking for them. GOV.UK explains that you have the right to speak for yourself in court without a solicitor or other legal professional.',
      'In practice, that means the person remains responsible for understanding the documents, following the timetable, preparing evidence, and presenting their own position. The phrase is commonly used in England and Wales when a court user is self-represented.',
    ],
  },
  {
    title: 'Why people represent themselves',
    paragraphs: [
      'People become litigants in person for different reasons. GOV.UK highlights two common ones directly: some people think it is better to talk to the judge themselves, and some cannot afford legal fees.',
      'In civil cases, self-representation also becomes more common when the dispute value is modest compared with the cost of full legal representation. That is why the phrase often overlaps with small claims, county court money disputes, and other situations where the paperwork still matters even if the case value is limited.',
    ],
  },
  {
    title: 'What rights and support can a litigant in person have?',
    paragraphs: [
      'The starting point is simple: you may speak for yourself in court. GOV.UK also says that if there is a hearing, you can represent yourself, pay for a solicitor or barrister, ask someone to advise you in court, or ask someone to speak on your behalf if the court gives permission.',
      'That does not mean you have to handle every problem in total isolation. You may also be able to check whether legal aid is available, and you may be allowed to have a McKenzie friend with you to assist in a more limited role.',
    ],
    bullets: [
      'Represent yourself in court and explain your own case.',
      'Prepare and rely on your documents and evidence.',
      'Ask someone to advise you in court even if they are not a lawyer.',
      'Ask someone to speak on your behalf, although the court may need to allow it.',
      'Check whether legal aid or other free support is available before assuming you must do everything alone.',
    ],
  },
  {
    title: 'What you still need to do yourself',
    paragraphs: [
      'Even when the court recognises that you are unrepresented, self-representation is still a practical workload. The main difficulty is rarely one dramatic legal point. It is usually the accumulation of paperwork, evidence, dates, and procedural steps that all have to stay coherent.',
      'That is why litigants in person often lose time in the same places: scattered files, unclear chronology, rushed witness material, or deadlines that were seen too late. Good preparation does not remove the pressure, but it makes the case easier to think about and easier to explain.',
    ],
    bullets: [
      'Keep pleadings, court orders, evidence, and correspondence together.',
      'Maintain a chronology so the sequence of events stays clear.',
      'Track service dates, filing dates, mediation appointments, and hearings.',
      'Prepare witness evidence and hearing notes early enough to review them properly.',
      'Separate factual evidence from arguments, assumptions, and emotional reactions.',
    ],
  },
  {
    title: 'Step by step: how to prepare your case',
    paragraphs: [
      'Preparation is usually strongest when it becomes a repeatable routine instead of a last-minute scramble. The aim is not to produce perfect paperwork in one sitting. The aim is to keep the whole case readable, current, and ready for the next court step.',
      'A workable setup usually starts with the papers already received, then adds a chronology, issue notes, deadline tracking, and a hearing file that can actually be used under pressure.',
    ],
    bullets: [
      'Gather the claim papers, court orders, correspondence, and supporting documents.',
      'Sort them into a clear working file instead of leaving them across inboxes and downloads.',
      'Write a short chronology and note what each important document proves.',
      'Record the next deadline and what has to be filed, served, or prepared before it.',
      'Keep a short list of the points or questions you still need to answer before the hearing.',
    ],
  },
  {
    title: 'Common mistakes litigants in person make',
    paragraphs: [
      'Most self-representation mistakes are organisational before they are legal. People often know the broad story of their case, but the court process depends on documents, sequence, and timing. When those parts are weak, everything else becomes harder.',
      'That is why small improvements in structure can have an outsized effect. A clear case file, a live chronology, and a visible deadline list remove a large amount of avoidable confusion.',
    ],
    bullets: [
      'Leaving preparation until the next hearing is too close.',
      'Keeping evidence without a clear explanation of why it matters.',
      'Mixing working notes, correspondence, and final documents together.',
      'Forgetting to keep proof of service or copies of what was sent.',
      'Treating the case as one large problem instead of breaking it into the next procedural step.',
    ],
  },
  {
    title: 'How MyMcKenzieCS helps litigants in person',
    paragraphs: [
      'MyMcKenzieCS is built as a court case management tool for UK litigants in person. It helps you keep documents, notes, reminders, and research support together so the case does not reset every time a new order or email arrives.',
      'That matters because self-representation is often lost in the handover between tasks. You read a document in one place, note a deadline in another, save a source somewhere else, and then have to rebuild the picture before every hearing. MyMcKenzieCS is designed to reduce that friction.',
    ],
    bullets: [
      'Document and evidence organisation in one workspace.',
      'Conversation history so earlier guidance does not disappear.',
      'Scheduled reminder emails on paid plans before saved case events.',
      'Source-backed web research support to help you understand procedure and context.',
      'Advanced case-law retrieval and study on Premium + for deeper authority work.',
    ],
    note: 'You remain responsible for your case, filings, and decisions. A case-management tool can improve clarity and consistency, but it does not become your lawyer or representative.',
  },
  {
    title: 'Where to get extra help when you need it',
    paragraphs: [
      'If you can get legal advice on a specific issue, it is often worth doing. A short paid review of a defence, witness statement, draft order, or hearing plan may save more time than hours of unguided searching.',
      'If paying for a lawyer is unrealistic, check whether legal aid may be available and consider practical support services such as Support Through Court. If you are also considering a lay supporter at a hearing, the separate McKenzie friend guide explains that role and its limits.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/uk/how-to-prepare-small-claims-court-uk',
    label: 'How to prepare for small claims court UK',
    description: 'Follow the practical preparation steps from claim papers to mediation, evidence, and the hearing file.',
  },
  {
    href: '/uk/organise-court-documents-uk',
    label: 'How to organise court documents UK',
    description: 'Build a workable system for pleadings, orders, evidence, correspondence, and proof of service.',
  },
  {
    href: '/uk/court-bundle-preparation-uk',
    label: 'Court bundle preparation UK',
    description: 'See how an organised case file becomes a paginated, indexed hearing bundle when the court requires one.',
  },
  {
    href: '/uk/do-you-need-a-lawyer-for-small-claims-court-uk',
    label: 'Do you need a lawyer for small claims court UK?',
    description: 'See when self-representation is realistic and where a paid legal review may still help.',
  },
  {
    href: '/uk/witness-statement-uk',
    label: 'Witness statement UK',
    description: 'Learn how factual evidence is structured, served, and kept tied to the live case file.',
  },
  {
    href: '/uk/directions-questionnaire-uk',
    label: 'Directions questionnaire UK',
    description: 'Understand the N180 and N181 stage and how it shapes the case timetable.',
  },
  {
    href: '/uk/small-claims-court-uk',
    label: 'Small claims court UK',
    description: 'See how lower-value county court money claims usually progress from claim to mediation and hearing.',
  },
  {
    href: '/uk/serving-court-documents-uk',
    label: 'Serving court documents',
    description: 'Learn the basics of service, addresses for service, and Form N215.',
  },
  {
    href: '/uk/mckenzie-friend-support',
    label: 'McKenzie friend support',
    description: 'Understand what a McKenzie friend can do at court and where a digital tool fits beside that role.',
  },
  {
    href: '/uk/case-law-search-uk',
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

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/uk/litigant-in-person-uk',
});

export const revalidate = 86400;

export default function LitigantInPersonUkPage() {
  return (
    <GuidePage
      path="/uk/litigant-in-person-uk"
      title={title}
      subtitle="A practical guide to what self-representation means, what rights a litigant in person has, and how to prepare a case without letting the paperwork take over."
      meta="Updated 27 March 2026 | England and Wales focus | Informational only"
      intro={[
        'People search for "litigant in person UK" when they are already carrying a live court problem. They usually do not need abstract legal language first. They need clarity about what the term means, what they are allowed to do, and how to stop the case becoming administratively overwhelming.',
        'This page is written for that moment. It explains the role of a litigant in person in England and Wales, the practical realities of preparing a case without a lawyer, and how MyMcKenzieCS helps you keep the case organised without pretending to replace professional legal advice.',
      ]}
      publishedDate="2026-03-17"
      modifiedDate="2026-03-27"
      stats={stats}
      sections={sections}
      faqItems={faqItems}
      faqTitle="Questions UK litigants in person commonly ask"
      faqIntro="This section is designed to capture the real search queries people use when they are trying to manage a case without representation. The answers stay high level and procedural, and they point back to official sources where the next step matters."
      relatedLinks={relatedLinks}
      ctaTitle="Move from general guidance to a working case file"
      ctaText="Use the next guides to turn self-representation from a broad idea into documents, deadlines, and a hearing file you can actually manage."
      primaryCta={{ href: '/uk/how-to-prepare-small-claims-court-uk', label: 'Follow the checklist' }}
      secondaryCta={{ href: '/uk/organise-court-documents-uk', label: 'Organise documents' }}
    />
  );
}
