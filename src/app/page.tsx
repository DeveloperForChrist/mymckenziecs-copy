import type { Metadata } from 'next';
import Image from 'next/image';
import HeroActionButtons from '@/components/home/HeroActionButtons';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import { DEADLINE_REMINDER_FEATURE } from '@/constants';

export const metadata: Metadata = {
  title: {
    absolute: 'MyMcKenzieCS | MyMcKenzie Court Support',
  },
  description: 'MyMcKenzieCS is the premier legal self-help workspace for UK litigants in person. Manage documents, deadlines, and court support in one place.',
};

const workspaceFeatures = [
  {
    title: 'Understand your position',
    text: 'Get plain-English procedural support to help you understand what may matter in your case.'
  },
  {
    title: 'Keep your case organised',
    text: 'Keep your facts, evidence, notes, and case context together in one workspace.'
  },
  {
    title: 'Review documents with context',
    text: 'Upload documents, store evidence, and get support that takes your case details into account.'
  },
  {
    title: 'Track deadlines',
    text: 'Manage hearings, tasks, reminders, and important dates from one place.'
  },
  {
    title: 'Stay focused on what matters',
    text: 'Separate relevant facts, evidence, and procedure from noise, confusion, and stress.'
  },
  {
    title: 'Research relevant authorities',
    text: 'Search judgments and study useful case law on paid plans when deeper research is needed.'
  }
];

const plans = [
  {
    name: 'Basic',
    price: '18',
    bullets: [
      'MyMcKenzie Court Support Basic Assistant',
      '10 document storage',
      'Conversation history included'
    ]
  },
  {
    name: 'Premium',
    price: '32',
    bullets: [
      'MyMcKenzie Court Support Smart Assistant',
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
      'MyMcKenzie Court Support Intelligent Assistant',
      '150 document storage',
      'Persistent chat history',
      'Advanced case law retrieval and study',
      'Enhanced research support',
      DEADLINE_REMINDER_FEATURE
    ]
  }
];

export default async function HomePage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op in server component render context.
        },
      },
    }
  );

  const { data: authData } = await supabase.auth.getUser();
  const hasAccountSession = isBillingEligibleUser(authData?.user);
  let hasPaidAccess = false;

  if (hasAccountSession && authData?.user?.id) {
    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('plan_type, status')
      .eq('user_id', authData.user.id)
      .order('updated_at', { ascending: false })
      .limit(5);

    hasPaidAccess = Boolean(
      (subscriptions || []).some((sub: any) => {
        const planLabel = String(sub?.plan_type || '').toLowerCase();
        const status = String(sub?.status || '').toLowerCase();
        const paidPlan = planLabel.includes('basic') || planLabel.includes('premium');
        const activeState = status === 'active' || status === 'past_due';
        return paidPlan && activeState;
      })
    );
  }

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
                    MyMcKenzie Court Support
                  </div>
                  <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white mt-5 leading-[1.05]">
                    Run your case
                    <br />
                    with structure, not stress.
                  </h1>
                  <p className="text-base md:text-xl text-white/85 mt-5 max-w-3xl mx-auto xl:mx-0 leading-relaxed">
                    MyMcKenzie Court Support is a legal self-help workspace for UK litigants in person: Providing legal procedural support,
                    document and evidence organisation, deadline tracking, and case law research in one place to navigate your case.
                  </p>
                  <HeroActionButtons hasAccountSession={hasAccountSession} hasPaidAccess={hasPaidAccess} />
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
                    alt="MyMcKenzie Court Support logo"
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
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Inside MyMcKenzie Court Support</div>
                <h3 className="text-2xl md:text-3xl font-semibold text-white mt-2">Everything you need to manage a legal matter in one workspace</h3>
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
            <div className="flex items-end justify-start flex-wrap gap-4 mb-7">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-purple-100/70">Plans</div>
                <h3 className="text-2xl md:text-3xl font-semibold text-white mt-2">Choose the level of support that fits your case</h3>
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
                <h3 className="text-2xl md:text-3xl font-semibold text-white mt-2">
                  Start building your case plan now.
                </h3>
                <p className="text-white/75 mt-3">
                  Start with one question, then organise the rest of your case from the same workspace.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="w-full text-white mt-0 text-center border-t border-white/10 bg-[#270427]">
        <div className="app-container py-12">
          <div className="text-base md:text-lg font-medium mb-2"> 2026 Lenjordan Ltd. All rights reserved.</div>
          <div className="text-base md:text-lg font-medium mb-4 text-white/85">
            MyMcKenzie Court Support is a product of Lenjordan Ltd.<br/>Company No. 16931933
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
            MyMcKenzie Court Support Assistant provides informational and court support only. Not legal advice.
          </div>
        </div>
      </footer>
    </div>
  );
}
