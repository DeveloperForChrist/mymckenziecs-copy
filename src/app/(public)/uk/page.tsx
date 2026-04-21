import type { Metadata } from 'next';
import MarketHomepage from '@/components/home/MarketHomepage';
import { DEADLINE_REMINDER_FEATURE } from '@/constants';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: 'Court Case Management Tool for UK Litigants in Person',
    description:
      'Organise court documents, track deadlines, and prepare your case without a lawyer using MyMcKenzieCS, a court case workspace built for UK litigants in person.',
    path: '/uk',
  }),
};
export const revalidate = 86400;

const commonProblems = [
  {
    title: 'Deadlines slip when papers are scattered',
    text: 'Court work becomes hard to manage when orders, emails, evidence, and reminders live in different places.',
  },
  {
    title: 'Evidence loses context',
    text: 'Documents are less useful if you cannot quickly see what happened, what each paper proves, and what still needs a response.',
  },
  {
    title: 'Preparation gets rebuilt from scratch',
    text: 'Many litigants in person end up re-reading the same paperwork before every hearing because there is no reliable case system.',
  },
  {
    title: 'Stress crowds out the next step',
    text: 'When a live case feels overwhelming, the practical question is usually what to do next and what document actually matters now.',
  },
];

const whoItsFor = [
  {
    title: 'Self-represented litigants in the UK',
    text: 'People handling a court case without a lawyer formally running the matter for them in a UK jurisdiction.',
  },
  {
    title: 'Small claims and civil court users',
    text: 'People preparing for filings, hearings, mediation, evidence, and deadline-heavy case steps.',
  },
  {
    title: 'People managing court papers alone',
    text: 'Users who need one place for documents, evidence, notes, chronology, and deadlines.',
  },
  {
    title: 'People preparing without a lawyer',
    text: 'Users who want structure and procedural support, while staying clear that the platform is not legal representation.',
  },
];

const useCases = [
  {
    title: 'Organise court documents',
    text: 'Keep pleadings, correspondence, evidence, witness material, and court orders in one workspace.',
  },
  {
    title: 'Track hearings and deadlines',
    text: 'Record service dates, filing dates, mediation appointments, hearings, and follow-up tasks in one place.',
  },
  {
    title: 'Prepare for court without a lawyer',
    text: 'Build a chronology, keep issue notes, and preserve the context behind the next step in your case.',
  },
  {
    title: 'Review evidence with context',
    text: 'Upload documents and keep notes tied to the facts, dates, and issues they relate to.',
  },
  {
    title: 'Research procedure and authorities',
    text: 'Use source-backed research support and case-law tools on paid plans when deeper preparation is needed.',
  },
  {
    title: 'Stay focused on what matters',
    text: 'Reduce the noise of a live case by separating working notes, deadlines, and evidence from stress and guesswork.',
  },
];

const plans = [
  {
    name: 'Basic',
    price: '18',
    bullets: ['MyMcKenzieCS Basic Assistant', '10 document storage', 'Conversation history included'],
  },
  {
    name: 'Premium',
    price: '32',
    bullets: ['MyMcKenzieCS Smart Assistant', '25 document storage', 'Conversation history included', DEADLINE_REMINDER_FEATURE],
    highlight: true,
  },
  {
    name: 'Premium +',
    price: '199',
    bullets: [
      'MyMcKenzieCS Intelligent Assistant',
      '150 document storage',
      'Persistent chat history',
      'Advanced case law retrieval and study',
      'Enhanced research support',
      DEADLINE_REMINDER_FEATURE,
    ],
  },
];

const guidePages = [
  {
    href: '/uk/litigant-in-person-uk',
    title: 'Litigant in person UK guide',
    text: 'Understand self-representation, your practical role, and the preparation habits that matter most.',
  },
  {
    href: '/uk/how-to-prepare-small-claims-court-uk',
    title: 'How to prepare for small claims court UK',
    text: 'A step-by-step guide to preparing your papers, evidence, deadlines, and hearing file.',
  },
  {
    href: '/uk/organise-court-documents-uk',
    title: 'How to organise court documents UK',
    text: 'Learn how to sort pleadings, orders, evidence, service records, and working notes into a usable case file.',
  },
  {
    href: '/uk/court-bundle-preparation-uk',
    title: 'Court bundle preparation UK',
    text: 'Learn how to turn the case file into a paginated, indexed hearing bundle when the court or order requires one.',
  },
  {
    href: '/uk/do-you-need-a-lawyer-for-small-claims-court-uk',
    title: 'Do you need a lawyer for small claims court UK?',
    text: 'See when people handle small claims without a lawyer and where professional advice may still help.',
  },
  {
    href: '/uk/legal-case-management-tool',
    title: 'Legal case management tool',
    text: 'See how documents, notes, reminders, and research fit into one court-preparation workflow.',
  },
];

export default function UkHomePage() {
  return (
    <MarketHomepage
      audienceLabel="For UK Self-Represented Litigants"
      titleLines={['Court case management', 'for self-represented litigants.']}
      description="Organise court documents, track deadlines, and prepare your case in one workspace built around UK self-representation."
      guideHeading="Helpful guides for UK self-representation"
      commonProblems={commonProblems}
      whoItsFor={whoItsFor}
      useCases={useCases}
      guidePages={guidePages}
      plans={plans}
      pricingHref="/uk/pricing"
      howItWorksHref="/uk/legal-case-management-tool"
      learnBasicsHref="/uk/litigant-in-person-uk"
      comparePlansHref="/uk/pricing"
      helpHref="/uk/help"
      aboutHref="/uk/about"
      faqHref="/uk/faq"
      footerLinks={[
        { href: '/uk/privacy-policy', label: 'Privacy Policy' },
        { href: '/uk/terms', label: 'Terms & Conditions' },
        { href: '/uk/cookie-policy', label: 'Cookie Policy' },
        { href: '/uk/contact', label: 'Contact' },
      ]}
      marketSwitch={{ href: '/?market=US', label: 'Looking for the U.S. version? Open the U.S. site' }}
      ctaTitle="Start building your case plan now."
      ctaText="Start with one question, then organise the rest of your documents, deadlines, and hearing preparation from the same workspace."
    />
  );
}
