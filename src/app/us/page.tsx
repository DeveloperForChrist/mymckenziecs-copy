import type { Metadata } from 'next';
import MarketHomepage from '@/components/home/MarketHomepage';
import { DEADLINE_REMINDER_FEATURE } from '@/constants';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: 'Case Support Workspace for U.S. Legal Support Work',
    description:
      'Organize clients, court documents, deadlines, notes, and case progress using the U.S. version of MyMcKenzieCS for legal support professionals and self-represented users.',
    path: '/us',
  }),
  alternates: {
    canonical: '/us',
    languages: {
      'en-US': '/us',
      'en-GB': '/uk',
      'x-default': '/uk',
    },
  },
};
export const revalidate = 86400;

const commonProblems = [
  {
    title: 'Deadlines drift across email, paper, and memory',
    text: 'Court work gets harder when notices, exhibits, and reminders live in different places and nothing shows the next task clearly.',
  },
  {
    title: 'Facts and documents stop lining up',
    text: 'A case is harder to explain when your notes, filings, evidence, and timeline no longer stay connected.',
  },
  {
    title: 'State-by-state procedure adds uncertainty',
    text: 'Self-represented litigants often know the dispute itself but still need one place to track what the local court process appears to require next.',
  },
  {
    title: 'Preparation restarts every time something changes',
    text: 'Without a working system, each new filing, hearing date, or court notice can force you to rebuild the case picture from scratch.',
  },
];

const whoItsFor = [
  {
    title: 'U.S. legal support professionals',
    text: 'People helping clients organise civil court matters, documents, notes, deadlines, and preparation context.',
  },
  {
    title: 'State and local court users',
    text: 'People preparing for filings, hearings, service, evidence, mediation, or small claims process that varies by court.',
  },
  {
    title: 'People managing case papers themselves',
    text: 'Users who need one workspace for documents, notes, chronology, deadlines, and practical research.',
  },
  {
    title: 'People who need structure, not a redesign',
    text: 'Users who want the same product workflow with U.S.-specific wording, guidance, and public content.',
  },
];

const useCases = [
  {
    title: 'Organize filings and evidence',
    text: 'Keep pleadings, notices, exhibits, letters, and supporting material in one working file.',
  },
  {
    title: 'Track hearings and court dates',
    text: 'Record filing dates, service dates, conferences, hearings, and follow-up tasks in one place.',
  },
  {
    title: 'Prepare without losing context',
    text: 'Build a chronology, keep issue notes, and preserve why each document matters as the case changes.',
  },
  {
    title: 'Research procedure more carefully',
    text: 'Use source-backed support while staying clear that court rules, local practice, and state law may vary.',
  },
  {
    title: 'Stay organized between court events',
    text: 'Keep the live case readable between motions, notices, negotiations, and hearing preparation.',
  },
  {
    title: 'Work from one shared structure',
    text: 'Move from scattered paperwork to one workflow for documents, deadlines, notes, and preparation.',
  },
];

const plans = [
  {
    name: 'Basic',
    price: '25',
    bullets: [
      'MyMcKenzieCS Basic Assistant',
      '10 document storage',
      'Conversation history included'
    ]
  },
  {
    name: 'Premium',
    price: '44',
    bullets: [
      'MyMcKenzieCS Smart Assistant',
      '25 document storage',
      'Conversation history included',
      DEADLINE_REMINDER_FEATURE
    ],
    highlight: true
  },
  {
    name: 'Premium +',
    price: '270',
    bullets: [
      'MyMcKenzieCS Intelligent Assistant',
      '150 document storage',
      'Persistent chat history',
      'Advanced case law retrieval and study',
      'Enhanced research support',
      DEADLINE_REMINDER_FEATURE
    ]
  }
];

const guidePages = [
  {
    href: '/us/self-represented-litigant-guide',
    title: 'U.S. self-represented litigant guide',
    text: 'Understand the language, limits, and preparation habits that matter when you are handling your own case.',
  },
  {
    href: '/us/small-claims-court-guide',
    title: 'U.S. small claims court guide',
    text: 'A practical overview of what usually matters in small claims and where local rules can vary.',
  },
  {
    href: '/us/organize-court-documents',
    title: 'How to organize court documents',
    text: 'Build a working case file for pleadings, exhibits, notices, service proof, and chronology.',
  },
  {
    href: '/us/case-law-research',
    title: 'U.S. case-law research guide',
    text: 'Learn how to find official opinions, track court level, and keep research tied to your live case.',
  },
  {
    href: '/us/legal-case-management-tool',
    title: 'Legal case management tool',
    text: 'See how the same MyMcKenzieCS workflow fits U.S. self-representation without changing the UI.',
  },
  {
    href: '/us/pricing',
    title: 'U.S. pricing and plan guide',
    text: 'Review the support tiers, current research limits, and where U.S.-specific coverage is still growing.',
  },
];

export default function UsHomePage() {
  return (
    <MarketHomepage
      audienceLabel="For U.S. Legal Support Work"
      titleLines={['Case support workspace', 'for U.S. legal matters.']}
      description="Organize clients, court documents, deadlines, notes, and case progress in one workspace built for U.S. legal support work."
      guideHeading="Helpful guides for U.S. legal support"
      commonProblems={commonProblems}
      whoItsFor={whoItsFor}
      useCases={useCases}
      guidePages={guidePages}
      plans={plans}
      planCurrencySymbol="$"
      pricingHref="/us/pricing"
      howItWorksHref="/us/legal-case-management-tool"
      directoryHref="/directory"
      learnBasicsHref="/us/self-represented-litigant-guide"
      comparePlansHref="/us/pricing"
      helpHref="/us/help"
      aboutHref="/us/about"
      faqHref="/us/faq"
      footerLinks={[
        { href: '/us/privacy-policy', label: 'Privacy Policy' },
        { href: '/us/terms', label: 'Terms & Conditions' },
        { href: '/us/cookie-policy', label: 'Cookie Policy' },
        { href: '/us/contact', label: 'Contact' },
      ]}
      marketSwitch={{ href: '/?market=GB', label: 'Need the UK / original version? Open the main site' }}
      ctaTitle="Start building your U.S. case workflow now."
      ctaText="Start with one question, then keep your filings, deadlines, hearing prep, and working notes in the same structure."
      plansNote="U.S. counterpart pricing is shown here as $25, $44, and $270 while the U.S. rollout continues expanding public content and jurisdiction-aware support."
    />
  );
}
