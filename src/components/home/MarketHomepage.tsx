'use client';

import Image from 'next/image';
import Link from 'next/link';
import HeroActionButtons from './HeroActionButtons';

type ContentCard = {
  title: string;
  text: string;
};

type GuideCard = {
  href: string;
  title: string;
  text: string;
};

type PlanCard = {
  name: string;
  price: string;
  bullets: string[];
  highlight?: boolean;
};

type FooterLink = {
  href: string;
  label: string;
};

type MarketSwitchLink = {
  href: string;
  label: string;
};

type MarketBanner = {
  href: string;
  title: string;
  linkLabel: string;
};

type MarketHomepageProps = {
  audienceLabel: string;
  titleLines: string[];
  description: string;
  guideHeading: string;
  commonProblems: ContentCard[];
  whoItsFor: ContentCard[];
  useCases: ContentCard[];
  guidePages: GuideCard[];
  plans: PlanCard[];
  planCurrencySymbol?: string;
  pricingHref: string;
  howItWorksHref: string;
  directoryHref?: string;
  learnBasicsHref: string;
  comparePlansHref: string;
  helpHref: string;
  aboutHref: string;
  faqHref?: string;
  footerLinks?: FooterLink[];
  marketSwitch?: MarketSwitchLink;
  ctaTitle: string;
  ctaText: string;
  plansNote?: string;
  marketBanner?: MarketBanner;
};

const defaultFooterLinks: FooterLink[] = [
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms & Conditions' },
  { href: '/cookie-policy', label: 'Cookie Policy' },
  { href: '/contact', label: 'Contact' },
];

export default function MarketHomepage({
  audienceLabel,
  titleLines,
  description,
  guideHeading,
  commonProblems,
  whoItsFor,
  useCases,
  guidePages,
  plans,
  planCurrencySymbol = '£',
  pricingHref,
  howItWorksHref,
  directoryHref,
  learnBasicsHref,
  comparePlansHref,
  helpHref,
  aboutHref,
  faqHref,
  footerLinks = defaultFooterLinks,
  marketSwitch,
  ctaTitle,
  ctaText,
  plansNote,
  marketBanner,
}: MarketHomepageProps) {
  // Homepage no longer includes the "Send to MCS Portal" lead form. Leads are collected from the directory page.
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

        <section className="w-full">
          <div className="app-container relative z-10">
            <div className="pt-12 pb-4 md:pt-16 md:pb-6">
              {marketBanner && (
                <div className="mb-5 rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-white/85 shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="text-sm md:text-base font-medium">
                      {marketBanner.title}
                    </div>
                    <Link
                      href={marketBanner.href}
                      className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs md:text-sm font-semibold text-white transition hover:bg-white/15"
                    >
                      {marketBanner.linkLabel}
                    </Link>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 xl:grid-cols-[1.03fr_0.97fr] gap-8 md:gap-10 items-center">
                <div className="text-center xl:text-left">
                  {marketSwitch && (
                    <div className="mb-5 inline-flex justify-center xl:justify-start">
                      <Link
                        href={marketSwitch.href}
                        className="rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs md:text-sm font-medium tracking-[0.12em] text-white/80 transition-colors hover:bg-white/12"
                      >
                        {marketSwitch.label}
                      </Link>
                    </div>
                  )}
                  <div className="text-xs md:text-sm font-medium uppercase tracking-[0.2em] text-white/70">
                    {audienceLabel}
                  </div>
                  <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mt-5 leading-[1.05]">
                    {titleLines.map((line, index) => (
                      <span key={line}>
                        {line}
                        {index < titleLines.length - 1 && <br />}
                      </span>
                    ))}
                  </h1>
                  <p className="text-base md:text-xl text-white/85 mt-5 max-w-3xl mx-auto xl:mx-0 leading-relaxed">
                    {description}
                  </p>
                  <HeroActionButtons pricingHref={pricingHref} howItWorksHref={howItWorksHref} directoryHref={directoryHref} />
                  <div className="mt-4 text-base md:text-lg text-white/82 leading-relaxed">
                    Already have an account or client portal invite?{' '}
                    <Link href="/auth/signin" className="font-semibold underline underline-offset-4 hover:text-purple-200 transition-colors">
                      Sign in here
                    </Link>
                    .
                  </div>
                  <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs uppercase tracking-[0.16em] text-white/70 xl:justify-start">
                    <span className="rounded-full border border-white/15 px-3 py-2">Client matters</span>
                    <span className="rounded-full border border-white/15 px-3 py-2">Document hub</span>
                    <span className="rounded-full border border-white/15 px-3 py-2">Notes and tasks</span>
                    <span className="rounded-full border border-white/15 px-3 py-2">Deadlines and payments</span>
                  </div>
                  <div className="mt-4 text-sm text-white/75">
                    Practice support and court information only. Not legal advice.
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
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">Legal support work becomes hard when client matters stop being organised</h2>
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
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">Built for independent legal support work and the clients behind it</h2>
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
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">Manage the client work that usually gets scattered</h2>
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
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">{guideHeading}</h2>
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

        <section className="w-full">
          <div className="app-container relative z-10 py-9 md:py-12">
            <div className="flex items-end justify-start flex-wrap gap-4 mb-7">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Plans</div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">Choose the workspace level that fits your practice</h2>
                {plansNote && (
                  <p className="mt-3 max-w-2xl text-sm md:text-base text-white/70">{plansNote}</p>
                )}
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
                    {planCurrencySymbol}{plan.price}
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

        <section className="w-full">
          <div className="app-container relative z-10 pb-16">
            <div className="rounded-[28px] border border-white/10 bg-gradient-to-r from-white/10 via-white/5 to-white/10 p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Get started</div>
                <h2 className="text-2xl md:text-3xl font-semibold text-white mt-2">
                  {ctaTitle}
                </h2>
                <p className="text-white/75 mt-3">
                  {ctaText}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link href={pricingHref} className="app-button-secondary">
                    View plans
                  </Link>
                  <Link href={learnBasicsHref} className="app-button-secondary">
                    View guides
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
            {footerLinks.map((link, index) => (
              <span key={link.href} className="contents">
                {index > 0 && <span>|</span>}
                <Link href={link.href} className="underline hover:text-purple-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#120117] rounded">{link.label}</Link>
              </span>
            ))}
          </div>
          <div className="max-w-3xl mx-auto text-sm md:text-base font-semibold opacity-90 mt-4 leading-relaxed text-white/80">
            MyMcKenzieCS provides practice support and court information only. Not legal advice.
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-sm text-white/65">
            <Link href={helpHref} className="underline hover:text-purple-200 transition-colors">Help</Link>
            <span>|</span>
            <Link href={aboutHref} className="underline hover:text-purple-200 transition-colors">About</Link>
            {faqHref && (
              <>
                <span>|</span>
                <Link href={faqHref} className="underline hover:text-purple-200 transition-colors">FAQ</Link>
              </>
            )}
          </div>
        </div>
      </footer>

    </div>
  );
}
