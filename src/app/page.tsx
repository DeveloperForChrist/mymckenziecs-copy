import Link from 'next/link';
import Image from 'next/image';
import PreloadingLink from '@/components/PreloadingLink';

const workspaceFeatures = [
  {
    title: 'Assistant Workspace',
    text: 'Ask procedural questions and get structured plain-English guidance.'
  },
  {
    title: 'Case Profile',
    text: 'Set your case type and stage so guidance stays context-aware.'
  },
  {
    title: 'Documents',
    text: 'Store evidence, upload drafts, and keep material linked to your case.'
  },
  {
    title: 'Calendar and Deadlines',
    text: 'Track court dates, tasks, and reminder events from one place.'
  },
  {
    title: 'Notes and Memory',
    text: 'Capture your facts, chronology, and strategy as the case evolves.'
  },
  {
    title: 'Case Law Research',
    text: 'Search judgments and study relevant authorities on paid plans.'
  }
];

const plans = [
  {
    name: 'Basic',
    price: '18',
    summary: 'For early stage organisation',
    bullets: [
      'MyMcKenzie Basic Assistant',
      '10 document storage',
      'Conversation history'
    ]
  },
  {
    name: 'Premium',
    price: '32',
    summary: 'For active case preparation',
    bullets: [
      'MyMckenzieCS Smart Assistant',
      '25 document storage',
      'OpenAI + web search'
    ],
    highlight: true
  },
  {
    name: 'Premium +',
    price: '199',
    summary: 'For high-volume matters',
    bullets: [
      'MyMckenzieCS Intelligent Assistant',
      '150+ document storage',
      'Case law search and study'
    ]
  }
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
                  <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mt-5 leading-[1.05]">
                    Run your case
                    <br />
                    with structure, not stress.
                  </h1>
                  <p className="text-base md:text-xl text-white/85 mt-5 max-w-3xl mx-auto xl:mx-0 leading-relaxed">
                    MymckenzieCS is your AI-assisted case workspace: procedural guidance, document support, deadlines,
                    and legal research in one connected flow.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3 justify-center xl:justify-start">
                    <PreloadingLink
                      href="/chatbot"
                      className="bg-gradient-to-r from-amber-300 to-orange-500 text-[#240025] font-bold py-4 px-8 rounded-full text-lg shadow-[0_16px_40px_rgba(0,0,0,0.32)] hover:from-amber-200 hover:to-orange-400 transition-colors border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
                    >
                      Try MymckenzieCS Assistant
                    </PreloadingLink>
                    <Link
                      href="/auth/signup"
                      className="app-button-secondary text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
                    >
                      Create account
                    </Link>
                    <Link
                      href="/pricing"
                      className="app-button-secondary text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
                    >
                      View plans
                    </Link>
                  </div>
                  <div className="mt-4 text-sm text-white/75">
                    Informational support only. Not legal advice.
                  </div>
                </div>

                <div
                  className="w-[350px] h-[350px] md:w-[500px] md:h-[500px] flex items-center justify-center mx-auto"
                  style={{
                    borderRadius: '9999px',
                    overflow: 'hidden',
                    backgroundColor: '#270427'
                  }}
                >
                  <Image
                    src="/assets/mymckenzie-high-resolution-logo (7) 1.svg"
                    alt="MymckenzieCS logo"
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

        {/* Product Surface */}
        <section className="w-full">
          <div className="app-container relative z-10 py-4 md:py-6">
            <div className="flex items-end justify-between flex-wrap gap-4 mb-7">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Inside MymckenzieCS</div>
                <h3 className="text-2xl md:text-3xl font-semibold text-white mt-2">Every tool tied to one case workspace</h3>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {workspaceFeatures.map((feature) => (
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

        {/* Plans */}
        <section className="w-full">
          <div className="app-container relative z-10 py-9 md:py-12">
            <div className="flex items-end justify-between flex-wrap gap-4 mb-7">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Plans</div>
                <h3 className="text-2xl md:text-3xl font-semibold text-white mt-2">Choose support level by case complexity</h3>
              </div>
              <Link
                href="/pricing"
                className="app-button-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#2c0430]"
              >
                Full pricing
              </Link>
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
                  <p className="text-sm text-white/75 mt-2">{plan.summary}</p>
                  <div className="mt-4 space-y-2 text-sm text-white/85">
                    {plan.bullets.map((item) => (
                      <div key={item}>{item}</div>
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
                <h3 className="text-2xl md:text-3xl font-semibold text-white mt-2">
                  Build your next action plan now.
                </h3>
                <p className="text-white/75 mt-3">
                  Start with one question, then run the whole case from the same workspace.
                </p>
              </div>
              <PreloadingLink
                href="/chatbot"
                className="bg-gradient-to-r from-amber-400 to-fuchsia-500 text-[#1f0b28] font-semibold px-8 py-3 rounded-full shadow-lg hover:from-amber-300 hover:to-fuchsia-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#270427]"
              >
                Try MymckenzieCS Assistant
              </PreloadingLink>
            </div>
          </div>
        </section>
      </main>
      <footer className="w-full text-white mt-0 text-center border-t border-white/10 bg-[#120117]">
        <div className="app-container py-12">
          <div className="text-base md:text-lg font-medium mb-2"> 2026 LenJordan Ltd. All rights reserved.</div>
          <div className="text-base md:text-lg font-medium mb-4 text-white/85">
            MymckenzieCS is a product of LenJordan Ltd.<br/>Company No. 16931933
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
            MyMcKenzie Assistant provides informational support only and is not a substitute for legal advice.
          </div>
        </div>
      </footer>
    </div>
  );
}
