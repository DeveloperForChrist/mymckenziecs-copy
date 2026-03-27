import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import HeroActionButtons from '@/components/home/HeroActionButtons';
import { DEADLINE_REMINDER_FEATURE } from '@/constants';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: 'Court Case Management Tool for Litigants in Person (UK)',
    description:
      'Organise court documents, track deadlines, and prepare your case without a lawyer using MyMcKenzieCS, a court case management tool for UK litigants in person.',
    path: '/',
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
    title: 'Litigants in person in the UK',
    text: 'People representing themselves in court without a solicitor or barrister running the case.',
  },
  {
    title: 'Small claims court users',
    text: 'People handling county court money disputes, mediation, directions questionnaires, and hearing preparation.',
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
    bullets: [
      'MyMcKenzieCS Basic Assistant',
      '10 document storage',
      'Conversation history included'
    ]
  },
  {
    name: 'Premium',
    price: '32',
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
    price: '199',
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
    href: '/litigant-in-person-uk',
    title: 'Litigant in person UK guide',
    text: 'Understand self-representation, your practical role, and the preparation habits that matter most.',
  },
  {
    href: '/how-to-prepare-small-claims-court-uk',
    title: 'How to prepare for small claims court UK',
    text: 'A step-by-step guide to preparing your papers, evidence, deadlines, and hearing file.',
  },
  {
    href: '/organise-court-documents-uk',
    title: 'How to organise court documents UK',
    text: 'Learn how to sort pleadings, orders, evidence, service records, and working notes into a usable case file.',
  },
  {
    href: '/court-bundle-preparation-uk',
    title: 'Court bundle preparation UK',
    text: 'Learn how to turn the case file into a paginated, indexed hearing bundle when the court or order requires one.',
  },
  {
    href: '/do-you-need-a-lawyer-for-small-claims-court-uk',
    title: 'Do you need a lawyer for small claims court UK?',
    text: 'See when people handle small claims without a lawyer and where professional advice may still help.',
  },
  {
    href: '/legal-case-management-tool',
    title: 'Legal case management tool',
    text: 'See how documents, notes, reminders, and research fit into one court-preparation workflow.',
  },
];

export default function HomePage() {
  return (
    <div className="homepage">
      <main
        className="purple-gradient-bg min-h-screen flex flex-col relative overflow-hidden"
        style={{
          fontFamily: "'Space Grotesk', 'Manrope', 'Segoe UI', sans-serif"
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-80">
          <div className="absolute -left-20 top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,184,108,0.35),transparent_70%)] blur-2xl" />
          <div className="absolute right-[-90px] top-[40%] h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(94,234,212,0.25),transparent_70%)] blur-2xl" />
        </div>

        {/* Hero Section */}
        <section className="w-full">
          <div className="app-container relative z-10">
            <div className="pt-12 pb-4 md:pt-16 md:pb-6">
              <div className="grid grid-cols-1 xl:grid-cols-[1.03fr_0.97fr] gap-8 md:gap-10 items-center">
                <div className="text-center xl:text-left">
                  <div className="text-xs md:text-sm font-medium uppercase tracking-[0.2em] text-white/70">
                    For UK Litigants in Person
                  </div>
                  <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mt-5 leading-[1.05]">
                    Court case management tool
                    <br />
                    for litigants in person.
                  </h1>
                  <p className="text-base md:text-xl text-white/85 mt-5 max-w-3xl mx-auto xl:mx-0 leading-relaxed">
                    Organise court documents, track deadlines, and prepare your case with a structured workspace designed for
                    people representing themselves in UK courts.
                  </p>
                  <HeroActionButtons />
                  <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs uppercase tracking-[0.16em] text-white/70 xl:justify-start">
                    <span className="rounded-full border border-white/15 px-3 py-2">Small claims court UK</span>
                    <span className="rounded-full border border-white/15 px-3 py-2">Witness statements</span>
                    <span className="rounded-full border border-white/15 px-3 py-2">Directions questionnaires</span>
                    <span className="rounded-full border border-white/15 px-3 py-2">Court documents</span>
                  </div>
                  <div className="mt-4 text-sm text-white/75">
                    Informational and court support only. Not legal advice.
                  </div>
                </div>

                <div
                  className="h-[min(82vw,350px)] w-[min(82vw,350px)] md:h-[500px] md:w-[500px] flex items-center justify-center mx-auto"
                  style={{
                    borderRadius: '9999px',
                    overflow: 'hidden',
                    backgroundColor: '#270427'
                  }}
                >
                  <Image
                    src="/assets/mymckenzie-high-resolution-logo (7) 1.svg"
                    alt="MyMcKenzieCS logo"
                    width={550}
                    height={550}
                    priority
                    className="h-full w-full object-contain object-center"
                    style={{
                      mixBlendMode: 'lighten',
                      filter: 'grayscale(1) brightness(2.6) contrast(1.65)'
                    }}
                  />
                </div>
              </div>

            </div>
          </div>
        </section>

        <section className="w-full">
          <div className="app-container relative z-10 py-4 md:py-6">
            <div className="flex items-end justify-between flex-wrap gap-4 mb-7">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Why this matters</div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">Representing yourself in court becomes hard when the case stops being organised</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {commonProblems.map((problem) => (
                <div
                  key={problem.title}
                  className="rounded-3xl border border-white/12 bg-gradient-to-br from-white/10 to-white/5 p-6 text-white shadow-[0_18px_50px_rgba(0,0,0,0.3)]"
                >
                  <div className="text-lg font-semibold">{problem.title}</div>
                  <p className="text-sm md:text-base text-white/75 mt-3 leading-relaxed">{problem.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full">
          <div className="app-container relative z-10 py-4 md:py-8">
            <div className="flex items-end justify-between flex-wrap gap-4 mb-7">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Who this is for</div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">Built for people preparing a UK court case without a lawyer</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              {whoItsFor.map((audience) => (
                <div
                  key={audience.title}
                  className="rounded-3xl border border-white/12 bg-gradient-to-br from-white/10 to-white/5 p-6 text-white shadow-[0_18px_50px_rgba(0,0,0,0.3)]"
                >
                  <div className="text-lg font-semibold">{audience.title}</div>
                  <p className="text-sm md:text-base text-white/75 mt-3 leading-relaxed">{audience.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full">
          <div className="app-container relative z-10 py-4 md:py-6">
            <div className="flex items-end justify-between flex-wrap gap-4 mb-7">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Use MyMcKenzieCS To</div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">Manage the parts of self-representation that usually become overwhelming</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {useCases.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-3xl border border-white/12 bg-gradient-to-br from-white/10 to-white/5 p-6 text-white shadow-[0_18px_50px_rgba(0,0,0,0.3)]"
                >
                  <div className="text-lg font-semibold">{feature.title}</div>
                  <p className="text-sm md:text-base text-white/75 mt-3 leading-relaxed">{feature.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="w-full">
          <div className="app-container relative z-10 py-4 md:py-8">
            <div className="flex items-end justify-between flex-wrap gap-4 mb-7">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Guides</div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">Helpful guides for UK litigants in person</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {guidePages.map((guide) => (
                <Link
                  key={guide.href}
                  href={guide.href}
                  className="rounded-3xl border border-white/12 bg-gradient-to-br from-white/10 to-white/5 p-6 text-white shadow-[0_18px_50px_rgba(0,0,0,0.3)] transition-transform hover:-translate-y-1"
                >
                  <div className="text-lg font-semibold">{guide.title}</div>
                  <p className="text-sm md:text-base text-white/75 mt-3 leading-relaxed">{guide.text}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Plans */}
        <section className="w-full">
          <div className="app-container relative z-10 py-9 md:py-12">
            <div className="flex items-end justify-start flex-wrap gap-4 mb-7">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Plans</div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">Choose the level of support that fits your case</h2>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-3xl border p-6 text-white shadow-[0_20px_60px_rgba(0,0,0,0.32)] ${
                    plan.highlight
                      ? 'border-amber-300/40 bg-gradient-to-b from-amber-300/20 to-white/8'
                      : 'border-white/10 bg-white/8'
                  }`}
                >
                  <div className="text-sm text-white/75">{plan.name}</div>
                  <div className="text-4xl font-bold mt-2">
                    £{plan.price}
                    <span className="text-base text-white/70">/month</span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-white/85">
                    {plan.bullets.map((item) => (
                      <div key={item}>
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Band */}
        <section className="w-full">
          <div className="app-container relative z-10 pb-16">
            <div className="rounded-[28px] border border-white/10 bg-gradient-to-r from-white/10 via-white/5 to-white/10 p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Get started</div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">
                  Start building your case plan now.
                </h2>
                <p className="text-white/75 mt-3">
                  Start with one question, then organise the rest of your documents, deadlines, and hearing preparation from the same workspace.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href="/litigant-in-person-uk" className="app-button-secondary">
                    Read the litigant guide
                  </Link>
                  <Link href="/pricing" className="app-button-secondary">
                    Compare plans
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="w-full text-white mt-0 text-center border-t border-white/10 bg-[#270427]">
        <div className="app-container py-12">
          <div className="text-base md:text-lg font-medium mb-2"> 2026 Lenjordan Ltd. All rights reserved.</div>
          <div className="text-base md:text-lg font-medium mb-4 text-white/85">
            MyMcKenzieCS is a product of Lenjordan Ltd.<br/>Company No. 16931933
          </div>
          <div className="flex flex-wrap justify-center gap-3 mb-4 text-sm md:text-base text-white/80">
            <a href="/privacy-policy" className="underline hover:text-purple-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#120117] rounded">Privacy Policy</a>
            <span>|</span>
            <a href="/terms" className="underline hover:text-purple-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#120117] rounded">Terms &amp; Conditions</a>
            <span>|</span>
            <a href="/cookie-policy" className="underline hover:text-purple-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#120117] rounded">Cookie Policy</a>
            <span>|</span>
            <a href="/help" className="underline hover:text-purple-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#120117] rounded">Help</a>
            <span>|</span>
            <a href="/contact" className="underline hover:text-purple-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#120117] rounded">Contact</a>
            <span>|</span>
            <a href="/about" className="underline hover:text-purple-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#120117] rounded">About</a>
          </div>
          <div className="max-w-3xl mx-auto text-sm md:text-base font-semibold opacity-90 mt-4 leading-relaxed text-white/80">
            MyMcKenzieCS Assistant provides informational and court support only. Not legal advice.
          </div>
        </div>
      </footer>
    </div>
  );
}
