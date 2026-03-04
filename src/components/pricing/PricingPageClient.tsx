'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import { safeBrowserSignOut } from '@/lib/auth/safe-browser-signout';
import { PLAN_PRICES } from '@/constants';

type PricingPageClientProps = {
  initialIsSignedIn: boolean;
};

export default function PricingPageClient({ initialIsSignedIn }: PricingPageClientProps) {
  const [isSignedIn, setIsSignedIn] = useState(initialIsSignedIn);
  const [authChecked, setAuthChecked] = useState(true);
  const [hasPaidPlan, setHasPaidPlan] = useState(false);
  const [planStatus, setPlanStatus] = useState('inactive');
  const [planChecked, setPlanChecked] = useState(false);
  const autoCheckoutStartedRef = useRef(false);
  const searchParams = useSearchParams();
  const planParam = (searchParams?.get('plan') || '').trim();
  const legacyCheckoutParam = (searchParams?.get('checkout') || '').trim();
  const knownLegacyPlan = PLAN_PRICES.some((plan) => plan.priceId && plan.priceId === legacyCheckoutParam);
  const checkoutPlanId = planParam || (knownLegacyPlan ? legacyCheckoutParam : '');
  const checkoutStatus =
    (searchParams?.get('checkout_status') || '').trim() ||
    ((legacyCheckoutParam === 'success' || legacyCheckoutParam === 'cancelled') ? legacyCheckoutParam : '');
  const hardLock = (searchParams?.get('hard_lock') || '').trim() === '1';
  const redirectPath = (searchParams?.get('redirect') || '').trim();
  const isCheckoutFlow = checkoutPlanId.length > 0;
  const navHref = redirectPath.startsWith('/') ? redirectPath : '/dashboard';
  const navLabel = navHref.startsWith('/settings')
    ? 'Return to Billing'
    : navHref.startsWith('/dashboard')
      ? 'Go to Dashboard'
      : 'Manage account';
  const isLapsedStatus = planStatus === 'expired' || planStatus === 'cancelled';

  function userHasPaidPlan(plan: any) {
    const label = String(plan || '').toLowerCase();
    return (
      label.includes('basic') ||
      label.includes('premium') ||
      label.includes('premium +')
    );
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setIsSignedIn(isBillingEligibleUser(data.session?.user));
      setAuthChecked(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setIsSignedIn(isBillingEligibleUser(session?.user));
      setAuthChecked(true);
    });

    return () => {
      cancelled = true;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  // Stripe price IDs for plans
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutErrorPlanKey, setCheckoutErrorPlanKey] = useState<string | null>(null);
  const [switchToSignInPending, setSwitchToSignInPending] = useState(false);

  const hasConfiguredPriceId = (priceId: string) => priceId.trim().length > 0;

  const getPlanButtonLabel = (priceId: string) =>
    checkoutLoading === priceId ? 'Redirecting…' : 'Launch your workspace';

  const handlePlanButtonClick = (priceId: string, planName: string, planKey: string) => {
    setCheckoutError(null);
    setCheckoutErrorPlanKey(null);
    if (!hasConfiguredPriceId(priceId)) {
      if (!isSignedIn) {
        const redirectTo = '/dashboard';
        window.location.href = `/auth/signup?plan=${encodeURIComponent(planName)}&redirect=${encodeURIComponent(redirectTo)}`;
        return;
      }
      setCheckoutError('This plan is temporarily unavailable. Please try again shortly.');
      setCheckoutErrorPlanKey(planKey);
      return;
    }
    void handleSubscribe(priceId, planKey);
  };

  async function handleSubscribe(priceId: string, planKey: string) {
    setCheckoutLoading(priceId);
    setCheckoutError(null);
    setCheckoutErrorPlanKey(null);
    const supabase = getSupabaseBrowserClient();
    const session = (await supabase.auth.getSession()).data.session;
    const idToken = session?.access_token;
    if (!idToken || !isBillingEligibleUser(session?.user)) {
      const redirectTo = `/pricing?plan=${encodeURIComponent(priceId)}`;
      window.location.href = `/auth/signup?planId=${encodeURIComponent(priceId)}&redirect=${encodeURIComponent(redirectTo)}`;
      return;
    }
    try {
      const res = await fetch('/api/stripe/plan-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ planId: priceId }),
      });
      const data = await res.json();
      if (!res.ok && data?.code === 'EMAIL_VERIFICATION_REQUIRED' && typeof data?.redirect === 'string') {
        window.location.href = data.redirect;
        return;
      }
      if (!res.ok || !data?.url) {
        setCheckoutError(data?.error || 'Unable to start checkout');
        setCheckoutErrorPlanKey(planKey);
        setCheckoutLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch (err: any) {
      setCheckoutError(err.message || 'Failed to start checkout');
      setCheckoutErrorPlanKey(planKey);
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleSwitchToSignIn() {
    if (switchToSignInPending) return;
    setSwitchToSignInPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      await safeBrowserSignOut(supabase);
    } finally {
      window.location.href = '/auth/signin?redirect=%2Fdashboard';
    }
  }

  const basicPriceId = PLAN_PRICES.find((plan) => plan.name === 'Basic')?.priceId || '';
  const premiumPriceId = PLAN_PRICES.find((plan) => plan.name === 'Premium')?.priceId || '';
  const premiumPlusPriceId = PLAN_PRICES.find((plan) => plan.name === 'Premium +')?.priceId || '';

  useEffect(() => {
    if (!authChecked || !isSignedIn || autoCheckoutStartedRef.current) return;
    if (!checkoutPlanId) return;

    const isKnownPlan = PLAN_PRICES.some((plan) => plan.priceId && plan.priceId === checkoutPlanId);
    if (!isKnownPlan) {
      setCheckoutError('Selected plan is unavailable. Please choose a plan below.');
      setCheckoutErrorPlanKey(null);
      return;
    }

    autoCheckoutStartedRef.current = true;
    const matchedPlan = PLAN_PRICES.find((plan) => plan.priceId === checkoutPlanId);
    const planKey = (matchedPlan?.name || '').toLowerCase().replace(/\s+/g, '-');
    void handleSubscribe(checkoutPlanId, planKey || 'unknown');
  }, [authChecked, isSignedIn, checkoutPlanId]);

  useEffect(() => {
    if (checkoutStatus !== 'cancelled') return;
    setCheckoutError('Checkout was cancelled. Choose a plan when you are ready.');
    setCheckoutErrorPlanKey(null);
  }, [checkoutPlanId, checkoutStatus]);

  useEffect(() => {
    if (!authChecked) return;
    if (!isSignedIn) {
      setHasPaidPlan(false);
      setPlanChecked(true);
      return;
    }

    let cancelled = false;
    setPlanChecked(false);

    fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((data) => {
        if (cancelled) return;
        const status = String(data?.planStatus || '').toLowerCase();
        setPlanStatus(status || 'inactive');
        setHasPaidPlan(Boolean(data?.paidAccess) || (userHasPaidPlan(data?.plan) && (status === 'active' || status === 'past_due')));
        setPlanChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHasPaidPlan(false);
        setPlanStatus('inactive');
        setPlanChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [authChecked, isSignedIn]);

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
            <a href="/" style={{ textDecoration: 'none' }}>
              <h2 style={{
                color: '#ffffff',
                fontSize: 'clamp(1.5rem, 7vw, 2.6rem)',
                fontWeight: 700,
                margin: 0,
                letterSpacing: '0.5px'
              }}>MyMcKenzieCS</h2>
            </a>
            <div>
              {authChecked && isSignedIn ? (
                isCheckoutFlow ? (
                  <span
                    style={{
                      color: 'rgba(255, 255, 255, 0.8)',
                      textDecoration: 'none',
                      padding: '0.5rem 1rem',
                      fontSize: 'clamp(0.92rem, 3.1vw, 1.1rem)',
                      fontWeight: 600
                    }}
                  >
                    Secure checkout
                  </span>
                ) : !planChecked ? (
                  <span
                    style={{
                      color: 'rgba(255, 255, 255, 0.8)',
                      textDecoration: 'none',
                      padding: '0.5rem 1rem',
                      fontSize: 'clamp(0.92rem, 3.1vw, 1.1rem)',
                      fontWeight: 600
                    }}
                  >
                    Loading account
                  </span>
                ) : !hasPaidPlan ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.8rem',
                      flexWrap: 'wrap',
                      justifyContent: 'flex-end',
                      padding: '0.25rem 0.5rem',
                    }}
                  >
                    <span
                      style={{
                        color: 'rgba(255, 255, 255, 0.85)',
                        textDecoration: 'none',
                        fontSize: 'clamp(0.92rem, 3.1vw, 1.1rem)',
                        fontWeight: 600
                      }}
                    >
                      {isLapsedStatus ? 'Resume subscription' : 'Complete registration'}
                    </span>
                    <button
                      type="button"
                      onClick={() => { void handleSwitchToSignIn(); }}
                      disabled={switchToSignInPending}
                      style={{
                        color: '#ffffff',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.35)',
                        borderRadius: '999px',
                        padding: '0.45rem 0.9rem',
                        fontSize: 'clamp(0.85rem, 2.8vw, 0.98rem)',
                        fontWeight: 600,
                        cursor: switchToSignInPending ? 'not-allowed' : 'pointer',
                        opacity: switchToSignInPending ? 0.75 : 1,
                      }}
                    >
                      {switchToSignInPending ? 'Switching...' : 'Already have an account? Sign in'}
                    </button>
                  </div>
                ) : (
                  <a
                    href={navHref}
                    style={{
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '0.5rem 1rem',
                      transition: 'color 0.3s ease',
                      fontSize: 'clamp(0.92rem, 3.1vw, 1.1rem)',
                      fontWeight: 600
                    }}
                  >
                    {navLabel}
                  </a>
                )
              ) : (
                <a
                  href="/auth/signin"
                  style={{
                    color: '#ffffff',
                    textDecoration: 'none',
                    padding: '0.5rem 1rem',
                    transition: 'color 0.3s ease',
                    fontSize: 'clamp(0.92rem, 3.1vw, 1.1rem)',
                    fontWeight: 600
                  }}
                >
                  Sign in
                </a>
              )}
            </div>
          </div>

          {authChecked && isSignedIn && planChecked && !hasPaidPlan && isLapsedStatus && (
            <div
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(248, 113, 113, 0.35)',
                background: 'linear-gradient(135deg, rgba(127, 29, 29, 0.35), rgba(55, 24, 24, 0.28))',
                padding: '14px 16px',
                marginBottom: '1.5rem',
              }}
            >
              <p style={{ margin: 0, color: '#fee2e2', fontWeight: 600 }}>
                Your paid access is paused. Choose a plan to resume full dashboard access.
              </p>
            </div>
          )}
          {hardLock && (
            <div
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(251, 191, 36, 0.35)',
                background: 'linear-gradient(135deg, rgba(92, 53, 10, 0.35), rgba(59, 34, 6, 0.28))',
                padding: '14px 16px',
                marginBottom: '1.5rem',
              }}
            >
              <p style={{ margin: 0, color: '#fde68a', fontWeight: 600 }}>
                Your account is in hard lock. Resume a plan to restore full workspace access.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gap: 'clamp(1.2rem, 4vw, 2.5rem)', alignItems: 'center', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', marginBottom: '3.5rem' }}>
            <div>
              <p style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.75rem', color: '#f8a76f', fontWeight: 600 }}>Pricing</p>
              <h1 style={{ fontSize: 'clamp(2rem, 8vw, 3.6rem)', lineHeight: 1.05, margin: '0.8rem 0 1rem 0' }}>
                Your in-person litigation workspace,
                <br />
                structured for people.
              </h1>
              <p style={{ fontSize: 'clamp(1rem, 3.2vw, 1.2rem)', color: '#cbd5f5', maxWidth: '520px' }}>
                Choose a plan that keeps you moving with confidence — from first questions to prepared filings.
              </p>
              <p style={{ marginTop: '14px', color: '#cbd5f5', fontSize: '0.95rem' }}>
                Not sure where to start? <a href="/faq" style={{ color: '#f8fafc', textDecoration: 'underline' }}>Read the plan FAQ</a>
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
              <p style={{ color: '#cbd5f5', marginBottom: '1rem' }}>Pick the tier that matches your workload and urgency.</p>
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>Basic</span>
                    <span style={{ color: '#9cc8ff' }}>£18 / mo</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>Premium</span>
                    <span style={{ color: '#7bd4c9' }}>£32 / mo</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>Premium +</span>
                    <span style={{ color: '#f8a76f' }}>£199 / mo</span>
                  </div>
                </div>
              </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Basic Plan */}
            <div className="p-8 text-center relative transition-all duration-300 hover:-translate-y-2 flex flex-col" style={{
              background: 'linear-gradient(160deg, rgba(17, 24, 39, 0.98), rgba(30, 41, 59, 0.92))',
              borderRadius: '26px',
              border: '1px solid rgba(248, 250, 252, 0.12)',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4)'
            }}>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">Basic</h3>
              <div className="text-4xl sm:text-5xl font-bold mb-6" style={{ color: '#9cc8ff' }}>
                £18<span className="text-xl sm:text-2xl">/Month</span>
              </div>
              <ul className="space-y-3 mb-8 text-left flex-grow">
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#9cc8ff' }}>✓</span> MyMcKenzieCS Basic Assistant
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#9cc8ff' }}>✓</span> 10 document storage
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#9cc8ff' }}>✓</span> Conversation history included
                </li>
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #93c5fd, #3b82f6)', border: '2px solid transparent' }}
                onClick={() => handlePlanButtonClick(basicPriceId, 'Basic', 'basic')}
                disabled={checkoutLoading === basicPriceId}
              >
                {getPlanButtonLabel(basicPriceId)}
              </button>
              {checkoutError && checkoutErrorPlanKey === 'basic' && (
                <p style={{ color: '#dc2626', marginTop: '8px' }}>{checkoutError}</p>
              )}
            </div>

            {/* Premium Plan */}
            <div className="p-8 text-center relative transition-all duration-300 hover:-translate-y-2 flex flex-col" style={{
              background: 'linear-gradient(160deg, rgba(20, 20, 30, 0.98), rgba(24, 32, 40, 0.92))',
              borderRadius: '26px',
              border: '1px solid rgba(248, 250, 252, 0.12)',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4)'
            }}>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">Premium</h3>
              <div className="text-4xl sm:text-5xl font-bold mb-6" style={{ color: '#7bd4c9' }}>
                £32<span className="text-xl sm:text-2xl">/Month</span>
              </div>
              <ul className="space-y-3 mb-8 text-left flex-grow">
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> MyMcKenzieCS Smart Assistant
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> 25 document storage
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> Conversation history included
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> Deadline reminder emails
                </li>
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)', border: '2px solid transparent' }}
                onClick={() => handlePlanButtonClick(premiumPriceId, 'Premium', 'premium')}
                disabled={checkoutLoading === premiumPriceId}
              >
                {getPlanButtonLabel(premiumPriceId)}
              </button>
              {checkoutError && checkoutErrorPlanKey === 'premium' && (
                <p style={{ color: '#dc2626', marginTop: '8px' }}>{checkoutError}</p>
              )}
            </div>

            {/* Premium + Plan */}
            <div className="p-8 text-center relative transition-all duration-300 hover:-translate-y-2 flex flex-col" style={{
              background: 'linear-gradient(160deg, rgba(15, 15, 25, 0.95), rgba(30, 20, 18, 0.9))',
              borderRadius: '26px',
              border: '1px solid rgba(248, 250, 252, 0.12)',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)'
            }}>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">Premium +</h3>
              <div className="text-4xl sm:text-5xl font-bold mb-6" style={{ color: '#f8a76f' }}>
                £199<span className="text-xl sm:text-2xl">/Month</span>
              </div>
              <ul className="space-y-3 mb-8 text-left flex-grow">
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> MyMcKenzieCS Intelligent Assistant
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> 150 document storage
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Persistent chat history
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Enhanced research support
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Advanced case law retrieval and study
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Deadline reminder emails
                </li>
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #f8a76f, #f26a3d)', border: '2px solid transparent' }}
                onClick={() => handlePlanButtonClick(premiumPlusPriceId, 'Premium +', 'premium-plus')}
                disabled={checkoutLoading === premiumPlusPriceId}
              >
                {getPlanButtonLabel(premiumPlusPriceId)}
              </button>
              {checkoutError && checkoutErrorPlanKey === 'premium-plus' && (
                <p style={{ color: '#dc2626', marginTop: '8px' }}>{checkoutError}</p>
              )}
            </div>
          </div>
          {checkoutError && !checkoutErrorPlanKey && (
            <p style={{ color: '#dc2626', marginTop: '12px', fontWeight: 600 }}>{checkoutError}</p>
          )}

        </div>
      </main>
    </>
  )
}
