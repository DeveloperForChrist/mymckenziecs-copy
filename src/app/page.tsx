import Link from 'next/link';
import Image from 'next/image';
import PreloadingLink from '@/components/PreloadingLink';

export default function HomePage() {
  return (
    <div className="homepage">
      <main className="purple-gradient-bg min-h-screen flex flex-col">
        {/* Hero Section */}
        <section className="w-full">
          <div className="app-container">
            <div className="pt-12 pb-8 md:pt-16 md:pb-12">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-10 md:gap-12">
                <div
                  className="w-[350px] h-[350px] md:w-[500px] md:h-[500px] flex items-center justify-center"
                  style={{
                    borderRadius: '9999px',
                    overflow: 'hidden'
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
                <div className="flex flex-col items-center md:items-start text-center md:text-left">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/90 shadow-sm">
                    Built for Litigants in Person
                  </div>
                  <h1 className="text-4xl md:text-6xl font-bold mt-5 mb-3 tracking-tight text-white drop-shadow-lg">
                    MyMcKenzie
                  </h1>
                  <h2 className="text-xl md:text-2xl font-semibold mb-5 text-purple-200">
                    Court Support
                  </h2>
                  <div className="text-base md:text-xl font-medium mb-6 max-w-3xl text-white/90 leading-relaxed">
                    AI-powered support for Litigants in Person.
                    <br />
                    Get procedural clarity, prepare documents, and manage your case with confidence.
                  </div>
                  <div className="flex flex-col gap-4 items-center md:items-start">
                    <PreloadingLink
                      href="/chatbot"
                      className="bg-gradient-to-r from-amber-400 to-fuchsia-500 text-[#1f0b28] font-bold py-4 px-10 rounded-full text-lg shadow-lg hover:from-amber-300 hover:to-fuchsia-400 transition-colors border border-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#270427]"
                    >
                      Talk to MyMcKenzie Assistant
                    </PreloadingLink>
                    <div className="flex flex-row gap-3 items-center justify-center md:justify-start">
                      <Link
                        href="/auth/signup"
                        className="app-button-secondary text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#270427]"
                      >
                        Sign up
                      </Link>
                      <Link
                        href="/auth/signin"
                        className="app-button-secondary text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#270427]"
                      >
                        Sign in
                      </Link>
                      <Link
                        href="/pricing"
                        className="app-button-secondary text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#270427]"
                      >
                        View Pricing
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-4xl">
                {[
                  { label: 'Case Steps', value: 'Clear next actions' },
                  { label: 'Document Help', value: 'Refine and improve' },
                  { label: 'Procedural Clarity', value: 'Know what’s next' }
                ].map((stat, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left shadow-[0_16px_40px_rgba(0,0,0,0.25)]"
                  >
                    <div className="text-sm text-white/70 mb-2">{stat.label}</div>
                    <div className="text-lg font-semibold text-white">{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Value Strip */}
        <section className="w-full">
          <div className="app-container py-8 md:py-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: 'Structured Guidance',
                  copy: 'Answers are organised like a legal brief so you can act on them quickly.'
                },
                {
                  title: 'Case Management',
                  copy: 'Notes, deadlines, and document storage keep everything in one place.'
                },
                {
                  title: 'Plain-English Support',
                  copy: 'We translate procedure into steps you can follow without a lawyer.'
                }
              ].map((item, idx) => (
                <div key={idx} className="rounded-3xl border border-white/10 bg-white/5 p-8 text-white shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
                  <div className="text-lg font-semibold mb-3">{item.title}</div>
                  <div className="text-sm md:text-base text-white/80 leading-relaxed">{item.copy}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="w-full">
          <div className="app-container py-12 md:py-14">
            <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">How It Works</div>
                <h3 className="text-2xl md:text-3xl font-semibold text-white mt-2">Three focused steps</h3>
              </div>
              <Link
                href="/auth/signup"
                className="app-button-secondary text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#270427]"
              >
                Start now
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: 'Ask a question',
                  text: 'Describe your situation in plain language. Attach documents if helpful.'
                },
                {
                  title: 'Get structured guidance',
                  text: 'Receive clear steps, key deadlines, and practical next actions.'
                },
                {
                  title: 'Organise your case',
                  text: 'Keep notes, documents, and key dates in one place as you move forward.'
                }
              ].map((step, index) => (
                <div key={step.title} className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
                  <div className="text-sm font-semibold text-purple-200">0{index + 1}</div>
                  <div className="text-lg font-semibold text-white mt-3">{step.title}</div>
                  <div className="text-white/75 mt-3 text-sm leading-relaxed">{step.text}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Capabilities */}
        <section className="w-full">
          <div className="app-container py-12 md:py-14">
            <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-10 items-start">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-7">
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Capabilities</div>
                <h3 className="text-2xl font-semibold text-white mt-3">Everything you need to move a case forward</h3>
                <p className="text-white/75 mt-4 leading-relaxed">
                  Practical, stepwise guidance tailored to UK court processes, designed to keep you on track.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {[
                  {
                    title: 'Improve documents',
                    text: 'Witness statements, letters, and applications, structured for clarity.'
                  },
                  {
                    title: 'Support your case',
                    text: 'Summaries, issue spotting, and action lists.'
                  },
                  {
                    title: 'Procedural guidance',
                    text: 'Deadlines, filing steps, and what to expect next.'
                  },
                  {
                    title: 'Case organisation',
                    text: 'Notes and reminders that keep you organised and ready.'
                  }
                ].map((card) => (
                  <div key={card.title} className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 to-white/5 p-5">
                    <div className="text-white font-semibold">{card.title}</div>
                    <div className="text-white/70 text-sm mt-2 leading-relaxed">{card.text}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA Band */}
        <section className="w-full">
          <div className="app-container pb-16">
            <div className="rounded-[28px] border border-white/10 bg-gradient-to-r from-white/10 via-white/5 to-white/10 p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Get started</div>
                <h3 className="text-2xl md:text-3xl font-semibold text-white mt-2">
                  Ask your first question today.
                </h3>
                <p className="text-white/75 mt-3">
                  We’ll help you build a clear, confident next step.
                </p>
              </div>
              <PreloadingLink
                href="/chatbot"
                className="bg-gradient-to-r from-amber-400 to-fuchsia-500 text-[#1f0b28] font-semibold px-8 py-3 rounded-full shadow-lg hover:from-amber-300 hover:to-fuchsia-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#270427]"
              >
                Talk to MyMcKenzie Assistant
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
            MyMcKenzie Assistant can make mistakes and does not provide legal advice. Always confirm before relying on any generated response.
          </div>
        </div>
      </footer>
    </div>
  );
}
