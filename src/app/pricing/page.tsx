'use client';

import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { PLAN_PRICES } from '@/constants';

export default function PricingPage() {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

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
      window.location.href = '/auth/signin';
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

  const standardPriceId = PLAN_PRICES.find((plan) => plan.name === 'Standard')?.priceId || '';
  const essentialPriceId = PLAN_PRICES.find((plan) => plan.name === 'Essential')?.priceId || '';
  const premiumCheapPriceId = PLAN_PRICES.find((plan) => plan.name === 'Premium Cheap')?.priceId || '';
  const plusPriceId = PLAN_PRICES.find((plan) => plan.name === 'Plus')?.priceId || '';

  return (
    <>
      {/* Navigation */}
      <header>
        <nav className="navbar" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 2rem',
          background: 'rgba(39, 4, 39, 0.9)',
          position: 'fixed',
          top: 0,
          width: '100%',
          zIndex: 1000
        }}>
          <a href="/" style={{ textDecoration: 'none' }}>
            <h2 style={{
              color: '#ffffff',
              fontSize: '2.6rem',
              fontWeight: 700,
              margin: 0,
              letterSpacing: '0.5px'
            }}>MymckenzieCS</h2>
          </a>
          <ul style={{ listStyle: 'none', display: 'flex', margin: 0, padding: 0 }}>
            <li>
              {authChecked && isSignedIn ? (
                <a
                  href="/settings"
                  style={{
                    color: '#ffffff',
                    textDecoration: 'none',
                    padding: '0.5rem 1rem',
                    transition: 'color 0.3s ease',
                    fontSize: '1.1rem',
                    fontWeight: 600
                  }}
                >
                  Return to Billing
                </a>
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
            </li>
          </ul>
        </nav>
      </header>

      <main style={{
        paddingTop: '110px',
        minHeight: '100vh',
        paddingBottom: '5rem',
        paddingLeft: '1rem',
        paddingRight: '1rem',
        background: 'radial-gradient(circle at 15% 20%, rgba(255, 214, 170, 0.35), transparent 45%), radial-gradient(circle at 85% 10%, rgba(135, 224, 216, 0.3), transparent 40%), linear-gradient(180deg, #0d0c12 0%, #141322 40%, #0f0f16 100%)',
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
          background: 'radial-gradient(circle, rgba(255, 127, 80, 0.3), transparent 70%)',
          filter: 'blur(20px)',
          opacity: 0.7
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-120px',
          left: '-80px',
          width: '320px',
          height: '320px',
          background: 'radial-gradient(circle, rgba(88, 198, 188, 0.35), transparent 70%)',
          filter: 'blur(24px)',
          opacity: 0.7
        }} />
        <div className="max-w-6xl mx-auto" style={{ position: 'relative', zIndex: 1 }}>
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
                  <span style={{ color: '#f8a76f' }}>£0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>Standard</span>
                  <span style={{ color: '#a5b4fc' }}>£15 / mo</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>Essential</span>
                  <span style={{ color: '#7bd4c9' }}>£25 / mo</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>Premium Cheap</span>
                  <span style={{ color: '#93c5fd' }}>£1 / mo</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>Plus</span>
                  <span style={{ color: '#f8a76f' }}>£45 / mo</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
            {/* Basic Plan */}
            <div className="p-8 text-center relative transition-all duration-300 hover:-translate-y-2" style={{
              background: 'linear-gradient(160deg, rgba(15, 15, 25, 0.95), rgba(23, 23, 35, 0.9))',
              borderRadius: '26px',
              border: '1px solid rgba(248, 250, 252, 0.12)',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)'
            }}>
              <h3 className="text-2xl font-bold text-white mb-4">Basic</h3>
              <div className="text-5xl font-bold mb-6" style={{ color: '#f8a76f' }}>Free</div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> MyMcKenzie Assistant (basic)
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> 20 messages per day
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> 5 document storage
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Session-only chat history (clears on logout/tab close)
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#dc2626' }}>✗</span> Case Law Search
                </li>
                <li className="flex items-start text-white">
                  {/* Removed: Saved Chat History & Case Memory */}
                </li>
              </ul>
              <a href="/auth/signin" className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1" style={{
                background: 'linear-gradient(135deg, #f8a76f, #f26a3d)',
                border: '2px solid transparent'
              }}>
                Choose Basic
              </a>
            </div>

            {/* Standard Plan */}
            <div className="p-8 text-center relative transition-all duration-300 hover:-translate-y-2" style={{
              background: 'linear-gradient(160deg, rgba(18, 22, 34, 0.95), rgba(22, 26, 38, 0.9))',
              borderRadius: '26px',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)'
            }}>
              <h3 className="text-3xl font-bold text-white mb-4">Standard</h3>
              <div className="text-5xl font-bold mb-6" style={{ color: '#a5b4fc' }}>
                £15<span className="text-2xl">/Month</span>
              </div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#a5b4fc' }}>✓</span> MyMcKenzie Smart Assistant
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#a5b4fc' }}>✓</span> Unlimited conversations with a 30‑message per thread limit
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#a5b4fc' }}>✓</span> 15 document storage
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#a5b4fc' }}>✓</span> Conversation history included
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#a5b4fc' }}>✓</span> Deadline reminder emails
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#dc2626' }}>✗</span> Case Law Search
                </li>
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #a5b4fc, #6366f1)', border: '2px solid transparent' }}
                onClick={() => handleSubscribe(standardPriceId)}
                disabled={!standardPriceId || checkoutLoading === standardPriceId}
              >
                {!standardPriceId ? 'Configure price ID' : (checkoutLoading === standardPriceId ? 'Redirecting…' : (isSignedIn ? 'Subscribe' : 'Sign in to Subscribe'))}
              </button>
              {checkoutError && checkoutLoading === standardPriceId && (
                <p style={{ color: '#dc2626', marginTop: '8px' }}>{checkoutError}</p>
              )}
            </div>

            {/* Essential Plan */}
            <div className="p-8 text-center relative transition-all duration-300 hover:-translate-y-2 scale-105" style={{
              background: 'linear-gradient(160deg, rgba(20, 20, 30, 0.98), rgba(24, 32, 40, 0.92))',
              borderRadius: '28px',
              border: '2px solid rgba(123, 212, 201, 0.6)',
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.4)'
            }}>
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-[30px] text-white text-sm font-bold uppercase" style={{
                background: '#7bd4c9'
              }}>
                Most Popular
              </div>
              <h3 className="text-3xl font-bold text-white mb-4 mt-2">Essential</h3>
              <div className="text-5xl font-bold mb-6" style={{ color: '#7bd4c9' }}>
                £25<span className="text-2xl">/Month</span>
              </div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> Everything included in Basic
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> MyMcKenzie Smart Assistant — finds information and reviews responses for correctness and safety
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> Unlimited conversations with a 40‑message per thread limit
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> 20 document storage
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> Conversation history included
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> Case Law Search + MyMckenzie Case Study
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> Deadline reminder emails
                </li>
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)', border: '2px solid transparent' }}
                onClick={() => handleSubscribe(essentialPriceId)}
                disabled={!essentialPriceId || checkoutLoading === essentialPriceId}
              >
                {!essentialPriceId ? 'Configure price ID' : (checkoutLoading === essentialPriceId ? 'Redirecting…' : (isSignedIn ? 'Subscribe' : 'Sign in to Subscribe'))}
              </button>
              {checkoutError && checkoutLoading === essentialPriceId && (
                <p style={{ color: '#dc2626', marginTop: '8px' }}>{checkoutError}</p>
              )}
            </div>

            {/* Premium Cheap Plan */}
            <div className="p-8 text-center relative transition-all duration-300 hover:-translate-y-2" style={{
              background: 'linear-gradient(160deg, rgba(20, 26, 45, 0.95), rgba(12, 16, 34, 0.9))',
              borderRadius: '26px',
              border: '1px solid rgba(147, 197, 253, 0.35)',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)'
            }}>
              <h3 className="text-3xl font-bold text-white mb-4">Premium Cheap</h3>
              <div className="text-5xl font-bold mb-6" style={{ color: '#93c5fd' }}>
                £1<span className="text-2xl">/Month</span>
              </div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#93c5fd' }}>✓</span> Everything included in Essential
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#93c5fd' }}>✓</span> Unlimited conversations with a 50‑message per thread limit
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#93c5fd' }}>✓</span> 30 document storage
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#93c5fd' }}>✓</span> Persistent chat history
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#93c5fd' }}>✓</span> Case Law Search + MyMckenzie Case Study
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#93c5fd' }}>✓</span> Deadline reminder emails
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#93c5fd' }}>✓</span> Priority support (reply within 24 hours)
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#93c5fd' }}>✓</span> Early access to new features
                </li>
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #93c5fd, #3b82f6)', border: '2px solid transparent' }}
                onClick={() => handleSubscribe(premiumCheapPriceId)}
                disabled={!premiumCheapPriceId || checkoutLoading === premiumCheapPriceId}
              >
                {!premiumCheapPriceId ? 'Configure price ID' : (checkoutLoading === premiumCheapPriceId ? 'Redirecting…' : (isSignedIn ? 'Subscribe' : 'Sign in to Subscribe'))}
              </button>
              {checkoutError && checkoutLoading === premiumCheapPriceId && (
                <p style={{ color: '#dc2626', marginTop: '8px' }}>{checkoutError}</p>
              )}
            </div>

            {/* Plus Plan */}
            <div className="p-8 text-center relative transition-all duration-300 hover:-translate-y-2" style={{
              background: 'linear-gradient(160deg, rgba(15, 15, 25, 0.95), rgba(30, 20, 18, 0.9))',
              borderRadius: '26px',
              border: '1px solid rgba(248, 250, 252, 0.12)',
              boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)'
            }}>
              <h3 className="text-3xl font-bold text-white mb-4">Plus</h3>
              <div className="text-5xl font-bold mb-6" style={{ color: '#f8a76f' }}>
                £45<span className="text-2xl">/Month</span>
              </div>
              <ul className="space-y-3 mb-8 text-left">
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Everything included in Essential
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Unlimited conversations with a 50‑message per thread limit
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> 30 document storage
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Persistent chat history
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Case Law Search + MyMckenzie Case Study
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Deadline reminder emails
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Priority support (reply within 24 hours)
                </li>
                <li className="flex items-start text-white">
                  <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> Early access to new features
                </li>
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #f8a76f, #f26a3d)', border: '2px solid transparent' }}
                onClick={() => handleSubscribe(plusPriceId)}
                disabled={!plusPriceId || checkoutLoading === plusPriceId}
              >
                {!plusPriceId ? 'Configure price ID' : (checkoutLoading === plusPriceId ? 'Redirecting…' : (isSignedIn ? 'Subscribe' : 'Sign in to Subscribe'))}
              </button>
              {checkoutError && checkoutLoading === plusPriceId && (
                <p style={{ color: '#dc2626', marginTop: '8px' }}>{checkoutError}</p>
              )}
            </div>
          </div>

        </div>
      </main>
    </>
  )
}
