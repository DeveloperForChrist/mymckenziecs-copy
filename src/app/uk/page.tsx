import type { Metadata } from 'next';
import MarketHomepage from '@/components/home/MarketHomepage';
import { DEADLINE_REMINDER_FEATURE } from '@/constants';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: 'Case Support Software for UK Legal Support Practices',
    description:
      'MyMcKenzieCS is a case support workspace for independent legal support professionals and litigants managing client matters and case preparation.',
    path: '/uk',
  }),
  alternates: {
    canonical: '/uk',
    languages: {
      'en-GB': '/uk',
      'en-US': '/us',
      'x-default': '/uk',
    },
  },
};
export const revalidate = 86400;

const commonProblems = [
  {
    title: 'Client work gets scattered',
    text: 'Independent legal support work becomes harder when WhatsApp messages, emails, documents, notes, and reminders all live in different places.',
  },
  {
    title: 'Documents lose context',
    text: 'Client papers are less useful if you cannot quickly see what happened, what each document relates to, and what still needs a response.',
  },
  {
    title: 'Preparation gets rebuilt',
    text: 'Each new client, hearing, or deadline can force you to rebuild the case picture if there is no reliable workspace behind the support.',
  },
  {
    title: 'Admin slows the practice down',
    text: 'The real pressure is often not one task. It is keeping clients, dates, papers, payments, and progress visible at the same time.',
  },
];

const whoItsFor = [
  {
    title: 'McKenzie Friends',
    text: 'Independent McKenzie Friends supporting Litigants in Person who need a calmer way to manage client matters.',
  },
  {
    title: 'Legal support professionals',
    text: 'Paralegals, consultants, and document-prep providers who want client work organised in one professional workspace.',
  },
  {
    title: 'Client-facing support providers',
    text: 'People helping clients manage documents, evidence, notes, chronology, deadlines, and practical preparation.',
  },
  {
    title: 'Litigants invited by their helper',
    text: 'Clients can benefit from a clearer case workspace while the support professional remains in control of the service relationship.',
  },
];

const useCases = [
  {
    title: 'Manage client matters',
    text: 'Keep client cases, notes, chronology, documents, deadlines, and preparation context in one workspace.',
  },
  {
    title: 'Track hearings and deadlines',
    text: 'Record service dates, filing dates, mediation appointments, hearings, client tasks, and follow-up actions in one place.',
  },
  {
    title: 'Support client preparation',
    text: 'Build chronologies, keep issue notes, and preserve the context behind each client’s next step.',
  },
  {
    title: 'Organise documents with context',
    text: 'Upload documents and keep notes tied to the facts, dates, clients, and issues they relate to.',
  },
  {
    title: 'Research procedure and authorities',
    text: 'Use source-backed research support and case-law tools on paid plans when deeper preparation is needed.',
  },
  {
    title: 'Present a more professional service',
    text: 'Replace scattered folders and messages with a structured workspace clients can understand and return to.',
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
    price: '149',
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
      audienceLabel="For Independent Legal Support Professionals and Litigants in Person"
      titleLines={['Run premium legal support work', 'from one organised workspace.']}
      description="Manage client matters, documents, deadlines, notes, billing, and case progress in a calm, professional platform built for independent legal support professionals and self-represented litigants."
      guideHeading="Helpful guides for legal support work"
      commonProblems={commonProblems}
      whoItsFor={whoItsFor}
      useCases={useCases}
      guidePages={guidePages}
      plans={plans}
      pricingHref="/uk/pricing"
      howItWorksHref="/uk/legal-case-management-tool"
      directoryHref="/directory"
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
      marketSwitch={{ href: '/us', label: 'U.S. site' }}
      ctaTitle="Start organising your client work now."
      ctaText="Start with one client matter, then keep documents, deadlines, notes, and preparation context in the same workspace."
    />
  );
}
