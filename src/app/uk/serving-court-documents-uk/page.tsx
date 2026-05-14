import type { Metadata } from 'next';
import GuidePage, { type GuideLink, type GuideSection, type GuideStat } from '@/components/guides/GuidePage';
import { buildPageMetadata } from '@/lib/seo';

const title = 'Serving Court Documents in the UK: Service, Addresses and Form N215';
const description =
  'Learn the basics of serving court documents in England and Wales, including who serves, common service methods, address-for-service rules, and when Form N215 is used.';

const stats: GuideStat[] = [
  {
    label: 'Who usually serves',
    value: 'A party usually serves the documents that party has prepared, unless a rule, practice direction, or court order says otherwise.',
  },
  {
    label: 'Common methods',
    value: 'Personal service, first-class post or next-business-day service, leaving at a permitted place, and some electronic methods.',
  },
  {
    label: 'Key form',
    value: 'Form N215 is the certificate of service used to tell the court what was served, on whom, and how.',
  },
  {
    label: 'Important limit',
    value: 'Service rules can vary by document and order, so the live rule in your case always matters most.',
  },
];

const sections: GuideSection[] = [
  {
    title: 'Why service matters',
    paragraphs: [
      'Service is how court documents formally reach the other side. In civil proceedings, it is not enough to assume the other party probably saw something. The rules are built around recognised methods, addresses, and proof.',
      'For a litigant in person, service can feel technical because it sits between paperwork and procedure. But it matters because late or defective service can disrupt the timetable and create disputes that have nothing to do with the actual merits of the case.',
    ],
  },
  {
    title: 'Who usually serves the document',
    paragraphs: [
      'Part 6 of the Civil Procedure Rules says that a party to proceedings will usually serve a document that party has prepared, unless a rule or practice direction says the court serves it or the court orders otherwise. The court serves documents it has prepared unless the rules or an order shift that responsibility back to a party.',
      'That is one reason litigants in person need to read court notices carefully. Some documents arrive from the court, but others are your responsibility to send properly to the other side.',
    ],
  },
  {
    title: 'Common methods of service',
    paragraphs: [
      'For documents other than the claim form in the United Kingdom, CPR Part 6 lists the main permitted methods. These include personal service, first-class post or another next-business-day delivery service, leaving the document at a permitted place, fax, other electronic methods where Practice Direction 6A is satisfied, or another method authorised by the court.',
      'The right method depends on the document, the stage of proceedings, and any address for service that has been given. That is why service questions often become easier once the case file, the order, and the other side\'s details are all kept in one place.',
    ],
  },
  {
    title: 'What an address for service means',
    paragraphs: [
      'After proceedings have started, CPR Part 6 says a party must usually give an address at which that party may be served with documents relating to the proceedings. If there is a solicitor acting, that will usually be the solicitor\'s business address within the United Kingdom. If there is no solicitor, it will usually be a UK address where the party resides or carries on business.',
      'Unless the document must be served personally or the court orders otherwise, documents are usually sent or left at that address for service. That is one of the main reasons it is important to keep track of the current address details in the case.',
    ],
  },
  {
    title: 'When Form N215 is used',
    paragraphs: [
      'HMCTS says Form N215 is the certificate of service in civil cases. It is used to tell the court which documents were served, who they were served on, and when, where, and how service happened.',
      'The same HMCTS page says the completed certificate must be delivered to the court dealing with the claim. CPR Part 6 also sets out the details that a certificate of service should contain depending on the method used, such as the date of posting or the date and time of electronic transmission.',
    ],
    note: 'Service rules can become more technical around claim forms, alternative service, service out of the jurisdiction, and deemed service dates. If your case turns on one of those issues, check the actual rule and any court order closely.',
  },
  {
    title: 'How MyMcKenzieCS helps with service',
    paragraphs: [
      'Service problems often come from disorganisation rather than legal complexity. The wrong document version gets sent, the address is not updated, the proof of sending is not saved, or the deadline gets lost among other tasks.',
      'MyMcKenzieCS helps by keeping the document history, court orders, deadlines, and follow-up notes in the same workspace. That makes it easier to see what had to be served, when it was sent, and what still needs recording.',
    ],
  },
];

const relatedLinks: GuideLink[] = [
  {
    href: '/uk/litigant-in-person-uk',
    label: 'Guide for litigants in person',
    description: 'Return to the main hub for the broader process issues around self-representation.',
  },
  {
    href: '/uk/organise-court-documents-uk',
    label: 'How to organise court documents UK',
    description: 'Keep service proof, court orders, and document versions tied to one usable case file.',
  },
  {
    href: '/uk/witness-statement-uk',
    label: 'Witness statement UK',
    description: 'See how service rules apply when statements have to be exchanged by the deadline in the order.',
  },
  {
    href: '/uk/court-bundle-preparation-uk',
    label: 'Court bundle preparation UK',
    description: 'See how served documents and proof of service fit into the later hearing bundle.',
  },
];

export const metadata: Metadata = buildPageMetadata({
  title,
  description,
  path: '/uk/serving-court-documents-uk',
});

export const revalidate = 86400;

export default function ServingCourtDocumentsUkPage() {
  return (
    <GuidePage
      path="/uk/serving-court-documents-uk"
      title={title}
      subtitle="A practical guide to who serves documents, where they are usually sent, and how to keep proof of service organised."
      meta="Updated 17 March 2026 | England and Wales civil focus | Informational only"
      intro={[
        'Searches for "serving court documents UK" usually happen when a deadline is already approaching. The question is rarely academic. A litigant in person wants to know who has to send the document, where it has to go, what methods are allowed, and how to prove service afterwards.',
        'This page gives that high-level map and explains where Form N215 fits, while staying clear that the live rule or order in your own case always matters most.',
      ]}
      stats={stats}
      sections={sections}
      relatedLinks={relatedLinks}
      ctaTitle="Keep service proof tied to the live file"
      ctaText="Service becomes much easier to manage when the sent document, the proof of sending, and the later hearing papers all stay connected."
      primaryCta={{ href: '/uk/organise-court-documents-uk', label: 'Organise case papers' }}
      secondaryCta={{ href: '/uk/court-bundle-preparation-uk', label: 'Prepare the bundle' }}
    />
  );
}
