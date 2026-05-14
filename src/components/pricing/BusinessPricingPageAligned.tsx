type BusinessPricingPageAlignedProps = {
  marketPrefix?: '' | '/uk' | '/us';
  homeHref: string;
  currencySymbol: string;
  prices: {
    solo: string;
    team: string;
    enterprise: string;
  };
  regionNote: string;
  signInHref?: string;
};

type BusinessPlan = {
  key: 'solo' | 'team' | 'enterprise';
  name: string;
  displayPrice: string;
  accent: string;
  note: string;
  features: string[];
  cta: string;
  href: string;
  cardBackground: string;
  buttonBackground: string;
};

export default function BusinessPricingPageAligned({
  marketPrefix = '',
  homeHref,
  currencySymbol,
  prices,
  regionNote,
  signInHref = '/auth/signin',
}: BusinessPricingPageAlignedProps) {
  const selectorHref = `${marketPrefix}/pricing`;
  const litigantsHref = `${marketPrefix}/pricing/litigants`;
  const signupHref = (planName: string) => {
    const params = new URLSearchParams({
      audience: 'business',
      plan: planName,
      redirect: '/business/dashboard',
    });
    if (marketPrefix === '/us') params.set('market', 'US');
    return `/auth/signup?${params.toString()}`;
  };

  const plans: BusinessPlan[] = [
    {
      key: 'solo',
      name: 'Solo',
      displayPrice: `${currencySymbol}${prices.solo}`,
      accent: '#9cc8ff',
      note: `New business subscribers: 7 days free, then ${currencySymbol}${prices.solo}/month`,
      features: [
        'One business workspace',
        'Client matters, notes, documents, and deadlines',
        'Business-grade AI assistant for support workflows',
        'Source-cited research support',
      ],
      cta: 'Start Solo',
      href: signupHref('Solo'),
      cardBackground: 'linear-gradient(160deg, rgba(17, 24, 39, 0.98), rgba(30, 41, 59, 0.92))',
      buttonBackground: 'linear-gradient(135deg, #93c5fd, #3b82f6)',
    },
    {
      key: 'team',
      name: 'Team',
      displayPrice: `${currencySymbol}${prices.team}`,
      accent: '#7bd4c9',
      note: `New business subscribers: 7 days free, then ${currencySymbol}${prices.team}/month`,
      features: [
        'Multiple team seats',
        'Shared client matter workspace',
        'Role-aware collaboration and task ownership',
        'Team billing and priority workspace support',
      ],
      cta: 'Start Team',
      href: signupHref('Team'),
      cardBackground: 'linear-gradient(160deg, rgba(20, 20, 30, 0.98), rgba(24, 32, 40, 0.92))',
      buttonBackground: 'linear-gradient(135deg, #7bd4c9, #3aa79d)',
    },
    {
      key: 'enterprise',
      name: 'Enterprise',
      displayPrice: 'Custom',
      accent: '#f8a76f',
      note: 'Tailored seats, onboarding, support, governance, and procurement review',
      features: [
        'Custom seats and workspace configuration',
        'Advanced admin controls and reporting',
        'Onboarding support for business workflows',
        'Security, procurement, and support review',
      ],
      cta: 'Contact sales',
      href: `${marketPrefix}/contact`,
      cardBackground: 'linear-gradient(160deg, rgba(15, 15, 25, 0.95), rgba(30, 20, 18, 0.9))',
      buttonBackground: 'linear-gradient(135deg, #f8a76f, #f26a3d)',
    },
  ];

  return (
    <>
      <main style={{
        paddingTop: '1rem',
        minHeight: '100vh',
        paddingBottom: '5rem',
        paddingLeft: 'clamp(0.75rem, 2.6vw, 1rem)',
        paddingRight: 'clamp(0.75rem, 2.6vw, 1rem)',
        background: 'radial-gradient(circle at 18% 14%, rgba(147, 51, 234, 0.2), transparent 48%), radial-gradient(circle at 86% 10%, rgba(236, 72, 153, 0.14), transparent 44%), linear-gradient(180deg, #270427 0%, #1d0326 48%, #13021a 100%)',
        color: '#f8fafc',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: '140px',
          right: '-120px',
          width: 'min(360px, 72vw)',
          height: 'min(360px, 72vw)',
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.24), transparent 70%)',
          filter: 'blur(20px)',
          opacity: 0.7
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-120px',
          left: '-80px',
          width: 'min(320px, 65vw)',
          height: 'min(320px, 65vw)',
          background: 'radial-gradient(circle, rgba(217, 70, 239, 0.18), transparent 70%)',
          filter: 'blur(24px)',
          opacity: 0.7
        }} />
        <div className="max-w-6xl mx-auto" style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            minHeight: 'auto',
            padding: '0.85rem 0',
            background: 'transparent',
            borderBottom: 'none',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '10px',
          }}>
            <a href={homeHref} style={{ textDecoration: 'none' }}>
              <h2 style={{
                color: '#ffffff',
                fontSize: 'clamp(1.5rem, 7vw, 2.6rem)',
                fontWeight: 700,
                margin: 0,
                letterSpacing: '0.5px'
              }}>MyMcKenzieCS</h2>
            </a>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <a
                href={selectorHref}
                style={{
                  color: 'rgba(255,255,255,0.75)',
                  textDecoration: 'none',
                  padding: '0.5rem 1rem',
                  transition: 'color 0.2s ease',
                  fontSize: 'clamp(0.88rem, 2.8vw, 1rem)',
                  fontWeight: 500
                }}
              >
                Pricing options
              </a>
              <a
                href={signInHref}
                style={{
                  color: '#ffffff',
                  textDecoration: 'none',
                  padding: '0.5rem 1.1rem',
                  border: '1px solid rgba(255,255,255,0.25)',
                  borderRadius: '8px',
                  fontSize: 'clamp(0.88rem, 2.8vw, 1rem)',
                  fontWeight: 600,
                  transition: 'border-color 0.2s ease, background 0.2s ease',
                  background: 'rgba(255,255,255,0.06)',
                }}
              >
                Sign in
              </a>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 'clamp(1.2rem, 4vw, 2.5rem)', alignItems: 'center', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', marginBottom: '3.5rem' }}>
            <div>
              <p style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.75rem', color: '#f8a76f', fontWeight: 600 }}>Business pricing</p>
              <h1 style={{ fontSize: 'clamp(2rem, 8vw, 3.6rem)', lineHeight: 1.05, margin: '0.8rem 0 1rem 0' }}>
                Start with the workspace,
                <br />
                then choose the level your business needs.
              </h1>
              <p style={{ fontSize: 'clamp(1rem, 3.2vw, 1.2rem)', color: '#cbd5f5', maxWidth: '520px' }}>
                Compare Solo, Team, and Enterprise plans for legal support businesses managing client matters, documents, reminders, research, and shared workflows.
              </p>
              <p style={{ marginTop: '14px', color: '#fde68a', fontSize: '0.98rem', fontWeight: 700 }}>
                Business subscriptions can start with 7 days free.
              </p>
              <p style={{ marginTop: '14px', color: '#bfdbfe', fontSize: '0.95rem', maxWidth: '560px', lineHeight: 1.6 }}>
                {regionNote}
              </p>
              <p style={{ marginTop: '14px', color: '#cbd5f5', fontSize: '0.95rem' }}>
                Looking for personal case support? <a href={litigantsHref} style={{ color: '#f8fafc', textDecoration: 'underline' }}>View litigant pricing</a>
              </p>
              <p style={{ marginTop: '10px', color: 'rgba(255,255,255,0.55)', fontSize: '0.88rem' }}>
                Already have a business account?{' '}
                <a href={signInHref} style={{ color: '#fde68a', textDecoration: 'underline', fontWeight: 600 }}>Sign in</a>
              </p>
            </div>
            <div style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02))',
              borderRadius: '24px',
              padding: '1.8rem',
              border: '1px solid rgba(248, 250, 252, 0.12)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.35)'
            }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.5rem' }}>Plan at a glance</h2>
              <p style={{ color: '#cbd5f5', marginBottom: '1rem' }}>Pick the tier that matches your team size and client workload.</p>
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontWeight: 600 }}>
                  <span>Solo</span>
                  <span style={{ color: '#9cc8ff' }}>{currencySymbol}{prices.solo} / mo</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontWeight: 600 }}>
                  <span>Team</span>
                  <span style={{ color: '#7bd4c9' }}>{currencySymbol}{prices.team} / mo</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', fontWeight: 600 }}>
                  <span>Enterprise</span>
                  <span style={{ color: '#f8a76f' }}>Custom</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {plans.map((plan) => (
              <div
                key={plan.key}
                className="p-8 text-center relative transition-all duration-300 hover:-translate-y-2 flex flex-col"
                style={{
                  background: plan.cardBackground,
                  borderRadius: '26px',
                  border: '1px solid rgba(248, 250, 252, 0.12)',
                  boxShadow: plan.key === 'enterprise' ? '0 16px 40px rgba(0, 0, 0, 0.35)' : '0 20px 45px rgba(0, 0, 0, 0.4)'
                }}
              >
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">{plan.name}</h3>
                <div className="text-4xl sm:text-5xl font-bold mb-6" style={{ color: plan.accent }}>
                  {plan.displayPrice}
                  {plan.key !== 'enterprise' && <span className="text-xl sm:text-2xl">/Month</span>}
                </div>
                <p style={{ marginTop: '-10px', marginBottom: '18px', color: plan.accent, fontWeight: 700 }}>
                  {plan.note}
                </p>
                <ul className="space-y-3 mb-8 text-left flex-grow">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start text-white">
                      <span className="mr-2 font-bold" style={{ color: plan.accent }}>✓</span> {feature}
                    </li>
                  ))}
                </ul>
                <a
                  className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                  style={{ background: plan.buttonBackground, border: '2px solid transparent', textDecoration: 'none' }}
                  href={plan.href}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
