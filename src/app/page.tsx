import type { Metadata } from 'next';
import MarketHomepage from '@/components/home/MarketHomepage';
import { DEADLINE_REMINDER_FEATURE } from '@/constants';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: 'Case Support Software for UK Legal Support Practices',
    description:
      'MyMcKenzieCS is a legal workspace for organising case preparation, client support, documents, notes, and deadlines in one place.',
    path: '/',
  }),
};
export const revalidate = 86400;

const commonProblems = [
  {
    title: 'Case work gets scattered',
    text: 'Both litigants in person and independent legal support professionals struggle when messages, documents, notes, and deadlines live across too many tools.',
  },
  {
    title: 'Documents lose context',
    text: 'Client papers are less useful if you cannot quickly see what happened, what each document relates to, and what still needs a response.',
  },
  {
    title: 'Preparation gets rebuilt',
    text: 'Each hearing, filing, or client update can force a reset if there is no reliable workspace holding the full case picture.',
  },
  {
    title: 'Admin slows the practice down',
    text: 'The real pressure is often not one task. It is keeping clients, dates, papers, payments, and progress visible at the same time.',
  },
];

const whoItsFor = [
  {
    title: 'Litigants in Person',
    text: 'People handling their own case who need one workspace for documents, notes, deadlines, and preparation.',
  },
  {
    title: 'Independent legal support professionals',
    text: 'McKenzie Friends, paralegals, consultants, and document-support providers managing client matters in one professional workspace.',
  },
  {
    title: 'Client-facing support providers',
    text: 'Professionals supporting clients with documents, chronology, evidence, deadlines, and practical preparation.',
  },
  {
    title: 'Litigants invited by professionals',
    text: 'Litigants can be invited into secure client portal workflows while professionals keep service delivery organised.',
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
    price: '14',
    bullets: ['MyMcKenzieCS Basic Assistant', '10 document storage', 'Conversation history included'],
  },
  {
    name: 'Premium',
    price: '24',
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
      audienceLabel="Legal Case Workspace"
      titleLines={['One organised legal case workspace.']}
      description="MyMcKenzieCS is a legal workspace for managing documents, deadlines, notes, and case preparation in one clear platform."
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
      marketSwitch={{ href: '/us', label: 'Looking for the U.S. version? Open the U.S. site' }}
      ctaTitle="Start organising your case work now."
      ctaText="Start with one case and keep documents, deadlines, notes, and preparation context in one workspace."
    />
  );
}
