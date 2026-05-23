import Link from 'next/link';
import { ArrowRight, Building2, FileText, UserRound, UsersRound } from 'lucide-react';

type PricingAudienceSelectorProps = {
  marketPrefix?: '' | '/uk' | '/us';
  homeHref: string;
  regionLabel: string;
};

const cardStyles =
  'group flex h-full flex-col justify-between rounded-lg border border-white/12 bg-white/[0.08] p-6 text-left text-white shadow-[0_22px_70px_rgba(0,0,0,0.28)] transition hover:-translate-y-1 hover:border-white/28 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1b0321]';

const audienceCards = [
  {
    href: '/pricing/litigants',
    icon: UserRound,
    accentClass: 'bg-teal-300/[0.15] text-teal-100',
    ctaClass: 'text-teal-100',
    label: 'Personal case support',
    title: 'Litigants in person',
    text: 'For individuals managing their own matter, organising documents, tracking deadlines, and using guided case support.',
    bullets: ['Your own case workspace', 'Document and deadline tools', 'Personal plan checkout'],
    cta: 'View litigant pricing',
  },
  {
    href: '/pricing/business',
    icon: Building2,
    accentClass: 'bg-amber-300/[0.15] text-amber-100',
    ctaClass: 'text-amber-100',
    label: 'Client-work operations',
    title: 'Business',
    text: 'For McKenzie Friends, paralegals, document-preparation providers, and legal support businesses managing client work.',
    bullets: ['Solo professional plan', 'Client matter workflows', 'Business workspace controls'],
    cta: 'View business pricing',
  },
];

export default function PricingAudienceSelector({
  marketPrefix = '',
  homeHref,
  regionLabel,
}: PricingAudienceSelectorProps) {
  const base = marketPrefix;

  return (
    <main className="min-h-screen bg-[#270427] text-white">
      <section className="relative overflow-hidden">
        <div className="app-container relative z-10 flex min-h-screen flex-col py-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <Link href={homeHref} className="text-2xl font-semibold tracking-normal text-white">
              MyMcKenzieCS
            </Link>
            <div className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white/75">
              {regionLabel}
            </div>
          </header>

          <div className="flex flex-1 items-center py-12">
            <div className="mx-auto w-full max-w-5xl">
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px] lg:items-end">
                <div className="max-w-3xl">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-100/80">
                    Choose your workspace
                  </div>
                  <h1 className="mt-4 text-4xl font-bold leading-tight text-white md:text-6xl">
                    Start with the right pricing track.
                  </h1>
                  <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/78 md:text-xl">
                    MyMcKenzieCS serves two different workflows: people handling their own case, and businesses supporting client matters. Pick the track that matches how the workspace will be used.
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.06] p-5 text-sm leading-relaxed text-white/68">
                  <div className="flex items-center gap-3 text-white">
                    <UsersRound aria-hidden="true" size={20} className="text-amber-100" />
                    <span className="font-semibold">Business plans are separate</span>
                  </div>
                  <p className="mt-3">
                    Solo is for client-work operations. Personal litigant plans remain on the existing Basic, Premium, and Premium + checkout path.
                  </p>
                </div>
              </div>

              <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2">
                {audienceCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link key={card.title} href={`${base}${card.href}`} className={cardStyles}>
                      <div>
                        <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.accentClass}`}>
                          <Icon aria-hidden="true" size={24} />
                        </div>
                        <div className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-white/52">
                          {card.label}
                        </div>
                        <h2 className="mt-2 text-2xl font-semibold">{card.title}</h2>
                        <p className="mt-3 text-sm leading-relaxed text-white/72 md:text-base">
                          {card.text}
                        </p>
                        <div className="mt-5 grid gap-2 text-sm text-white/68">
                          {card.bullets.map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <FileText aria-hidden="true" size={15} className="text-white/42" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className={`mt-7 inline-flex items-center gap-2 text-sm font-semibold ${card.ctaClass}`}>
                        {card.cta}
                        <ArrowRight aria-hidden="true" size={16} className="transition group-hover:translate-x-1" />
                      </div>
                    </Link>
                  );
                })}
              </div>

              <p className="mt-8 max-w-3xl text-sm leading-relaxed text-white/58">
                MyMcKenzieCS provides practice support and court information only. It is not legal advice or representation.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
