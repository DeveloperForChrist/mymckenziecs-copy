'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { PLAN_PRICES } from '@/constants';

export default function PricingPage() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasPaidPlan, setHasPaidPlan] = useState(false);
  const [planStatus, setPlanStatus] = useState('free');
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
  const navHref = redirectPath.startsWith('/') ? redirectPath : '/settings';
  const navLabel = navHref.startsWith('/settings')
    ? 'Return to Billing'
    : navHref.startsWith('/dashboard')
      ? 'Return to Dashboard'
      : 'Manage account';
  const isLapsedStatus = planStatus === 'expired' || planStatus === 'cancelled';

  function userHasPaidPlan(plan: unknown) {
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
      setIsSignedIn(Boolean(data.session?.user));
      setAuthChecked(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      setIsSignedIn(Boolean(session?.user));
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

  async function handleSubscribe(priceId: string) {
    setCheckoutLoading(priceId);
    setCheckoutError(null);
    const supabase = getSupabaseBrowserClient();
    const session = (await supabase.auth.getSession()).data.session;
    const idToken = session?.access_token;
    if (!idToken) {
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
      if (!res.ok || !data?.url) {
        setCheckoutError(data?.error || 'Unable to start checkout');
        setCheckoutLoading(null);
        return;
      }
      window.location.href = data.url;
    } catch (err: any) {
      setCheckoutError(err.message || 'Failed to start checkout');
    } finally {
      setCheckoutLoading(null);
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
      return;
    }

    autoCheckoutStartedRef.current = true;
    void handleSubscribe(checkoutPlanId);
  }, [authChecked, isSignedIn, checkoutPlanId]);

  useEffect(() => {
    if (checkoutStatus !== 'cancelled') return;
    setCheckoutError('Checkout was cancelled. Choose a plan when you are ready.');
  }, [checkoutStatus]);

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
        setPlanStatus(status || 'free');
        setHasPaidPlan(Boolean(data?.paidAccess) || (userHasPaidPlan(data?.plan) && (status === 'active' || status === 'past_due')));
        setPlanChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHasPaidPlan(false);
        setPlanStatus('free');
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
        paddingLeft: '1rem',
        paddingRight: '1rem',
        background: 'radial-gradient(circle at 18% 14%, rgba(147, 51, 234, 0.2), transparent 48%), radial-gradient(circle at 86% 10%, rgba(236, 72, 153, 0.14), transparent 44%), linear-gradient(180deg, #270427 0%, #1d0326 48%, #13021a 100%)',
        color: '#f8fafc',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute',
          top: '140px',
          right: '-120px',
          width: '360px',
          height: '360px',
          background: 'radial-gradient(circle, rgba(168, 85, 247, 0.24), transparent 70%)',
          filter: 'blur(20px)',
          opacity: 0.7
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-120px',
          left: '-80px',
          width: '320px',
          height: '320px',
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
            minHeight: '88px',
            padding: '1rem 0',
            background: 'transparent',
            borderBottom: 'none',
            marginBottom: '1.25rem'
          }}>
            <a href="/" style={{ textDecoration: 'none' }}>
              <h2 style={{
                color: '#ffffff',
                fontSize: '2.6rem',
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
                      fontSize: '1.1rem',
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
                      fontSize: '1.1rem',
                      fontWeight: 600
                    }}
                  >
                    Loading account
                  </span>
                ) : !hasPaidPlan ? (
                  <span
                    style={{
                      color: 'rgba(255, 255, 255, 0.85)',
                      textDecoration: 'none',
                      padding: '0.5rem 1rem',
                      fontSize: '1.1rem',
                      fontWeight: 600
                    }}
                  >
                    {isLapsedStatus ? 'Resume subscription' : 'Complete registration'}
                  </span>
                ) : (
                  <a
                    href={navHref}
                    style={{
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '0.5rem 1rem',
                      transition: 'color 0.3s ease',
                      fontSize: '1.1rem',
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
                    fontSize: '1.1rem',
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

          <div style={{ display: 'grid', gap: '2.5rem', alignItems: 'center', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', marginBottom: '3.5rem' }}>
            <div>
              <p style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.75rem', color: '#f8a76f', fontWeight: 600 }}>Pricing</p>
              <h1 style={{ fontSize: '3.6rem', lineHeight: 1.05, margin: '0.8rem 0 1rem 0' }}>
                Legal support that feels human, priced like a utility.
              </h1>
              <p style={{ fontSize: '1.2rem', color: '#cbd5f5', maxWidth: '520px' }}>
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
              <h3 className="text-3xl font-bold text-white mb-4">Basic</h3>
              <div className="text-5xl font-bold mb-6" style={{ color: '#9cc8ff' }}>
                £18<span className="text-2xl">/Month</span>
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
                onClick={() => handleSubscribe(basicPriceId)}
                disabled={!basicPriceId || checkoutLoading === basicPriceId}
              >
                {!basicPriceId ? 'Configure price ID' : (checkoutLoading === basicPriceId ? 'Redirecting…' : 'Launch your workspace')}
              </button>
              {checkoutError && checkoutLoading === basicPriceId && (
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
              <h3 className="text-3xl font-bold text-white mb-4">Premium</h3>
              <div className="text-5xl font-bold mb-6" style={{ color: '#7bd4c9' }}>
                £32<span className="text-2xl">/Month</span>
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
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> Enhanced research support
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> Deadline reminder emails
                </li>
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)', border: '2px solid transparent' }}
                onClick={() => handleSubscribe(premiumPriceId)}
                disabled={!premiumPriceId || checkoutLoading === premiumPriceId}
              >
                {!premiumPriceId ? 'Configure price ID' : (checkoutLoading === premiumPriceId ? 'Redirecting…' : 'Launch your workspace')}
              </button>
              {checkoutError && checkoutLoading === premiumPriceId && (
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
              <h3 className="text-3xl font-bold text-white mb-4">Premium +</h3>
              <div className="text-5xl font-bold mb-6" style={{ color: '#f8a76f' }}>
                £199<span className="text-2xl">/Month</span>
              </div>
              <ul className="space-y-3 mb-8 text-left flex-grow">
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> MyMcKenzieCS Intelligent Assistant
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> 150+ document storage
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Persistent chat history
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
                onClick={() => handleSubscribe(premiumPlusPriceId)}
                disabled={!premiumPlusPriceId || checkoutLoading === premiumPlusPriceId}
              >
                {!premiumPlusPriceId ? 'Configure price ID' : (checkoutLoading === premiumPlusPriceId ? 'Redirecting…' : 'Launch your workspace')}
              </button>
              {checkoutError && checkoutLoading === premiumPlusPriceId && (
                <p style={{ color: '#dc2626', marginTop: '8px' }}>{checkoutError}</p>
              )}
            </div>
          </div>

        </div>
      </main>
    </>
  )
}
