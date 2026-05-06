'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import {
  findPlanByAnyPriceId,
  getPlanFeatures,
  getPlanPriceId,
  isKnownPlanPriceId,
  PLAN_PRICES,
  type BillingMarket,
} from '@/constants';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';
import { buildMarketAwareAuthHref } from '@/lib/markets/public-routes';
import { isBillingActiveStripeStatus, isTrialingStripeStatus } from '@/lib/payments/subscription-status';

type PricingGuideLink = {
  href: string;
  label: string;
};

type PricingPageClientProps = {
  audienceDescription?: string;
  availabilityMessage?: string;
  guideIntroText?: string;
  guideLinks?: PricingGuideLink[];
  faqHref?: string;
  billingMarket?: BillingMarket;
  currencySymbol?: string;
  priceByPlan?: {
    basic: string;
    premium: string;
    premiumPlus: string;
  };
};

const defaultGuideLinks: PricingGuideLink[] = [
  { href: '/litigant-in-person-uk', label: 'UK self-representation guide' },
  { href: '/mckenzie-friend-support', label: 'McKenzie friend support guide' },
  { href: '/case-law-search-uk', label: 'case-law search guide' },
];

export default function PricingPageClient({
  audienceDescription = 'Compare plans for McKenzie Friends, legal support professionals, and the clients they support, then start with the option that fits your workload.',
  availabilityMessage = 'Case-law tools are available now for UK legal matters. U.S. authority coverage and database access will be introduced soon.',
  guideIntroText = 'If you support UK clients, start with the',
  guideLinks = defaultGuideLinks,
  faqHref = '/faq',
  billingMarket = 'GB',
  currencySymbol = '£',
  priceByPlan = {
    basic: '18',
    premium: '32',
    premiumPlus: '199',
  },
}: PricingPageClientProps) {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasPaidPlan, setHasPaidPlan] = useState(false);
  const [currentPlan, setCurrentPlan] = useState('No plan');
  const [planStatus, setPlanStatus] = useState('inactive');
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(null);
  const [scheduledPlan, setScheduledPlan] = useState<string | null>(null);
  const [scheduledChangeDate, setScheduledChangeDate] = useState<string | null>(null);
  const [planChecked, setPlanChecked] = useState(false);
  const autoCheckoutStartedRef = useRef(false);
  const searchParams = useSearchParams();
  const planParam = (searchParams?.get('plan') || '').trim();
  const legacyCheckoutParam = (searchParams?.get('checkout') || '').trim();
  const knownLegacyPlan = isKnownPlanPriceId(legacyCheckoutParam);
  const checkoutPlanId = planParam || (knownLegacyPlan ? legacyCheckoutParam : '');
  const checkoutStatus =
    (searchParams?.get('checkout_status') || '').trim() ||
    ((legacyCheckoutParam === 'success' || legacyCheckoutParam === 'cancelled') ? legacyCheckoutParam : '');
  const redirectPath = (searchParams?.get('redirect') || '').trim();
  const isCheckoutFlow = checkoutPlanId.length > 0;
  const isLapsedStatus = planStatus === 'expired' || planStatus === 'cancelled';
  const isTrialingStatus = isTrialingStripeStatus(planStatus);
  const dashboardHref = getAppRouteForMarket('/dashboard', billingMarket);
  const billingSettingsHref = getAppRouteForMarket('/settings?tab=billing', billingMarket);
  const homeHref = billingMarket === 'US' ? '/us' : '/uk';

  const renderGuideLinks = (links: PricingGuideLink[]) => (
    <>
      {links.map((link, index) => (
        <span key={link.href}>
          {index > 0 && (index === links.length - 1 ? ' or ' : ', ')}
          <a href={link.href} style={{ color: '#f8fafc', textDecoration: 'underline' }}>{link.label}</a>
        </span>
      ))}
    </>
  );

  function formatPlanDate(value?: string | null) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

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

    supabase.auth.getSession()
      .then(({ data }) => {
        if (cancelled) return;
        setIsSignedIn(isBillingEligibleUser(data.session?.user));
        setAuthChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsSignedIn(false);
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
  const [changePlanMessage, setChangePlanMessage] = useState<string | null>(null);

  const hasConfiguredPriceId = (priceId: string) => priceId.trim().length > 0;
  const isCurrentPlanLabel = (planName: string) => currentPlan.trim().toLowerCase() === planName.trim().toLowerCase();
  const signedInNavHref = redirectPath.startsWith('/settings')
    ? redirectPath
    : hasPaidPlan
      ? (redirectPath.startsWith('/') ? redirectPath : dashboardHref)
      : billingSettingsHref;
  const signedInNavLabel = redirectPath.startsWith('/settings')
    ? 'Return to Billing'
    : hasPaidPlan && signedInNavHref.startsWith(dashboardHref.split('?')[0])
      ? 'Go to Dashboard'
      : 'Manage account';

  const getPlanButtonLabel = (priceId: string, planName: string) => {
    if (checkoutLoading === priceId) return 'Updating…';
    if (!hasPaidPlan) return isLapsedStatus ? 'Resume plan' : 'Start free trial';

    const normalizedCurrent = currentPlan.trim().toLowerCase();
    const normalizedTarget = planName.trim().toLowerCase();
    if (normalizedCurrent === normalizedTarget) return 'Current plan';

    const currentMatchedPlan = PLAN_PRICES.find((plan) => plan.name.toLowerCase() === normalizedCurrent);
    const targetMatchedPlan = PLAN_PRICES.find((plan) => plan.name.toLowerCase() === normalizedTarget);
    const currentIndex = currentMatchedPlan ? PLAN_PRICES.indexOf(currentMatchedPlan) : -1;
    const targetIndex = targetMatchedPlan ? PLAN_PRICES.indexOf(targetMatchedPlan) : -1;
    if (currentIndex >= 0 && targetIndex >= 0 && targetIndex < currentIndex) {
      return 'Downgrade at renewal';
    }
    return 'Change plan now';
  };

  const handlePlanButtonClick = (priceId: string, planName: string, planKey: string) => {
    setCheckoutError(null);
    setCheckoutErrorPlanKey(null);
    setChangePlanMessage(null);
    if (!hasConfiguredPriceId(priceId)) {
      if (!isSignedIn) {
        const redirectTo = dashboardHref;
        window.location.href = buildMarketAwareAuthHref('/auth/signup', billingMarket, {
          plan: planName,
          redirect: redirectTo,
        });
        return;
      }
      setCheckoutError('This plan is temporarily unavailable. Please try again shortly.');
      setCheckoutErrorPlanKey(planKey);
      return;
    }
    if (hasPaidPlan) {
      void handleChangePlan(priceId, planKey);
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
      const redirectTo = getAppRouteForMarket(`/dashboard?activatePlan=${encodeURIComponent(priceId)}`, billingMarket);
      window.location.href = buildMarketAwareAuthHref('/auth/signup', billingMarket, {
        planId: priceId,
        redirect: redirectTo,
      });
      return;
    }

    const startStripeCheckout = async () => {
      const res = await fetch('/api/stripe/plan-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          planId: priceId,
          cancelUrl: window.location.origin + window.location.pathname,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data?.code === 'EMAIL_VERIFICATION_REQUIRED' && typeof data?.redirect === 'string') {
        window.location.href = data.redirect;
        return true;
      }
      if (!res.ok || !data?.url) {
        setCheckoutError(data?.error || 'Unable to start checkout');
        setCheckoutErrorPlanKey(planKey);
        return true;
      }
      window.location.href = data.url;
      return true;
    };

    try {
      const res = await fetch('/api/user/start-trial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ planId: priceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data?.code === 'EMAIL_VERIFICATION_REQUIRED' && typeof data?.redirect === 'string') {
        window.location.href = data.redirect;
        return;
      }
      if (!res.ok && data?.code === 'TRIAL_ALREADY_USED') {
        await startStripeCheckout();
        return;
      }
      if (!res.ok) {
        setCheckoutError(data?.error || 'Unable to start your free trial');
        setCheckoutErrorPlanKey(planKey);
        return;
      }

      const nextLocation = redirectPath.startsWith('/') ? redirectPath : dashboardHref;
      window.location.href = nextLocation;
    } catch (err: any) {
      setCheckoutError(err.message || 'Failed to start your free trial');
      setCheckoutErrorPlanKey(planKey);
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handleChangePlan(priceId: string, planKey: string) {
    setCheckoutLoading(priceId);
    setCheckoutError(null);
    setCheckoutErrorPlanKey(null);
    setChangePlanMessage(null);

    try {
      const res = await fetch('/api/stripe/change-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ planId: priceId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCheckoutError(data?.error || 'Unable to change plan');
        setCheckoutErrorPlanKey(planKey);
        return;
      }

      if (data?.changeTiming === 'unchanged') {
        setChangePlanMessage(`You are already on ${data?.targetPlan || currentPlan}.`);
      } else if (data?.changeTiming === 'period_end') {
        const effectiveLabel = data?.effectiveDate
          ? new Date(data.effectiveDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : 'your next billing date';
        setScheduledPlan(data?.targetPlan || null);
        setScheduledChangeDate(data?.effectiveDate || null);
        setChangePlanMessage(`Downgrade scheduled. Your plan will change to ${data?.targetPlan || 'the selected plan'} on ${effectiveLabel}.`);
      } else {
        setCurrentPlan(data?.targetPlan || currentPlan);
        setScheduledPlan(null);
        setScheduledChangeDate(null);
        setChangePlanMessage(`Plan changed to ${data?.targetPlan || 'the selected plan'}.`);
      }

      const planRes = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
      if (planRes.ok) {
        const refreshed = await planRes.json();
        const status = String(refreshed?.planStatus || '').toLowerCase();
        setPlanStatus(status || 'inactive');
        setNextBillingDate(typeof refreshed?.nextBillingDate === 'string' ? refreshed.nextBillingDate : null);
        setCurrentPlan(String(refreshed?.plan || 'No plan'));
        setScheduledPlan(refreshed?.scheduledPlan || null);
        setScheduledChangeDate(refreshed?.scheduledChangeDate || null);
        setHasPaidPlan(Boolean(refreshed?.paidAccess) || (userHasPaidPlan(refreshed?.plan) && isBillingActiveStripeStatus(status)));
      }
    } catch (err: any) {
      setCheckoutError(err.message || 'Failed to change plan');
      setCheckoutErrorPlanKey(planKey);
    } finally {
      setCheckoutLoading(null);
    }
  }

  const basicPriceId = getPlanPriceId('Basic', billingMarket);
  const premiumPriceId = getPlanPriceId('Premium', billingMarket);
  const premiumPlusPriceId = getPlanPriceId('Premium +', billingMarket);

  const CASE_LAW_FEATURE = 'Advanced case law retrieval and study';
  const decoratePlanFeaturesForMarket = (features: string[]) => {
    if (billingMarket !== 'US') return features;
    return features.map((feature) =>
      feature === CASE_LAW_FEATURE
        ? `${feature} (Coming soon for U.S. matters)`
        : feature
    );
  };

  const basicPlanFeatures = decoratePlanFeaturesForMarket(getPlanFeatures('Basic'));
  const premiumPlanFeatures = decoratePlanFeaturesForMarket(getPlanFeatures('Premium'));
  const premiumPlusPlanFeatures = decoratePlanFeaturesForMarket(getPlanFeatures('Premium +'));

  useEffect(() => {
    if (!authChecked || !isSignedIn || autoCheckoutStartedRef.current) return;
    if (!planChecked) return;
    if (!checkoutPlanId) return;

    const isKnownPlan = isKnownPlanPriceId(checkoutPlanId);
    if (!isKnownPlan) {
      setCheckoutError('Selected plan is unavailable. Please choose a plan below.');
      setCheckoutErrorPlanKey(null);
      return;
    }

    autoCheckoutStartedRef.current = true;
    const matchedPlan = findPlanByAnyPriceId(checkoutPlanId);
    const planKey = (matchedPlan?.name || '').toLowerCase().replace(/\s+/g, '-');
    if (hasPaidPlan) {
      void handleChangePlan(checkoutPlanId, planKey || 'unknown');
      return;
    }
    void handleSubscribe(checkoutPlanId, planKey || 'unknown');
  }, [authChecked, isSignedIn, planChecked, hasPaidPlan, checkoutPlanId]);

  useEffect(() => {
    if (checkoutStatus !== 'cancelled') return;
    setCheckoutError('Checkout was cancelled. Choose a plan when you are ready.');
    setCheckoutErrorPlanKey(null);
  }, [checkoutPlanId, checkoutStatus]);

  useEffect(() => {
    if (!authChecked) return;
    if (!isSignedIn) {
      setHasPaidPlan(false);
      setNextBillingDate(null);
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
        setNextBillingDate(typeof data?.nextBillingDate === 'string' ? data.nextBillingDate : null);
        setCurrentPlan(String(data?.plan || 'No plan'));
        setScheduledPlan(data?.scheduledPlan || null);
        setScheduledChangeDate(data?.scheduledChangeDate || null);
        setHasPaidPlan(Boolean(data?.paidAccess) || (userHasPaidPlan(data?.plan) && isBillingActiveStripeStatus(status)));
        setPlanChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        setHasPaidPlan(false);
        setCurrentPlan('No plan');
        setPlanStatus('inactive');
        setNextBillingDate(null);
        setScheduledPlan(null);
        setScheduledChangeDate(null);
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
            <a href={homeHref} style={{ textDecoration: 'none' }}>
              <h2 style={{
                color: '#ffffff',
                fontSize: 'clamp(1.5rem, 7vw, 2.6rem)',
                fontWeight: 700,
                margin: 0,
                letterSpacing: '0.5px'
              }}>MyMcKenzieCS</h2>
            </a>
            <div>
              {!authChecked ? (
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
              ) : isSignedIn ? (
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
                      {isLapsedStatus ? 'Resume subscription' : 'Choose a plan'}
                    </span>
                    <a
                      href={signedInNavHref}
                      style={{
                        color: '#ffffff',
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.35)',
                        borderRadius: '999px',
                        padding: '0.45rem 0.9rem',
                        fontSize: 'clamp(0.85rem, 2.8vw, 0.98rem)',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {signedInNavLabel}
                    </a>
                  </div>
                ) : (
                  <a
                    href={signedInNavHref}
                    style={{
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '0.5rem 1rem',
                      transition: 'color 0.3s ease',
                      fontSize: 'clamp(0.92rem, 3.1vw, 1.1rem)',
                      fontWeight: 600
                    }}
                  >
                    {signedInNavLabel}
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
          {authChecked && isSignedIn && planChecked && hasPaidPlan && isTrialingStatus && (
            <div
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(125, 211, 252, 0.35)',
                background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.35), rgba(15, 23, 42, 0.24))',
                padding: '14px 16px',
                marginBottom: '1.5rem',
              }}
            >
              <p style={{ margin: 0, color: '#dbeafe', fontWeight: 600 }}>
                Free trial active.
                {nextBillingDate ? ` First charge on ${formatPlanDate(nextBillingDate)} unless you cancel beforehand.` : ''}
              </p>
            </div>
          )}
          {changePlanMessage && (
            <div
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(125, 211, 252, 0.35)',
                background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.35), rgba(15, 23, 42, 0.24))',
                padding: '14px 16px',
                marginBottom: '1.5rem',
              }}
            >
              <p style={{ margin: 0, color: '#dbeafe', fontWeight: 600 }}>
                {changePlanMessage}
              </p>
            </div>
          )}

          {scheduledPlan && scheduledChangeDate && (
            <div
              style={{
                borderRadius: '16px',
                border: '1px solid rgba(251, 191, 36, 0.35)',
                background: 'linear-gradient(135deg, rgba(120, 53, 15, 0.32), rgba(51, 24, 12, 0.22))',
                padding: '14px 16px',
                marginBottom: '1.5rem',
              }}
            >
              <p style={{ margin: 0, color: '#fde68a', fontWeight: 600 }}>
                Scheduled change: {currentPlan} stays active until {new Date(scheduledChangeDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}, then switches to {scheduledPlan}.
              </p>
            </div>
          )}

          <div style={{ display: 'grid', gap: 'clamp(1.2rem, 4vw, 2.5rem)', alignItems: 'center', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', marginBottom: '3.5rem' }}>
            <div>
              <p style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.75rem', color: '#f8a76f', fontWeight: 600 }}>Pricing</p>
              <h1 style={{ fontSize: 'clamp(2rem, 8vw, 3.6rem)', lineHeight: 1.05, margin: '0.8rem 0 1rem 0' }}>
                Start with the workspace,
                <br />
                then choose the level your practice needs.
              </h1>
              <p style={{ fontSize: 'clamp(1rem, 3.2vw, 1.2rem)', color: '#cbd5f5', maxWidth: '520px' }}>
                {audienceDescription}
              </p>
              <p style={{ marginTop: '14px', color: '#fde68a', fontSize: '0.98rem', fontWeight: 700 }}>
                Your first paid subscription starts with 7 days free.
              </p>
              <p style={{ marginTop: '14px', color: '#bfdbfe', fontSize: '0.95rem', maxWidth: '560px', lineHeight: 1.6 }}>
                {availabilityMessage}
              </p>
              <p style={{ marginTop: '14px', color: '#cbd5f5', fontSize: '0.95rem' }}>
                Not sure where to start? <a href={faqHref} style={{ color: '#f8fafc', textDecoration: 'underline' }}>Read the plan FAQ</a>
              </p>
              <p style={{ marginTop: '10px', color: '#cbd5f5', fontSize: '0.95rem' }}>
                {guideIntroText} {renderGuideLinks(guideLinks)}.
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
              <p style={{ color: '#cbd5f5', marginBottom: '1rem' }}>Pick the tier that matches your client workload and urgency.</p>
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>Basic</span>
                    <span style={{ color: '#9cc8ff' }}>{currencySymbol}{priceByPlan.basic} / mo</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>Premium</span>
                    <span style={{ color: '#7bd4c9' }}>{currencySymbol}{priceByPlan.premium} / mo</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                    <span>Premium +</span>
                    <span style={{ color: '#f8a76f' }}>{currencySymbol}{priceByPlan.premiumPlus} / mo</span>
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
                {currencySymbol}{priceByPlan.basic}<span className="text-xl sm:text-2xl">/Month</span>
              </div>
              <p style={{ marginTop: '-10px', marginBottom: '18px', color: '#dbeafe', fontWeight: 700 }}>New subscribers: 7 days free, then {currencySymbol}{priceByPlan.basic}/month</p>
              <ul className="space-y-3 mb-8 text-left flex-grow">
                {basicPlanFeatures.map((feature) => (
                  <li key={feature} className="flex items-start text-white">
                    <span className="mr-2 font-bold" style={{ color: '#9cc8ff' }}>✓</span> {feature}
                  </li>
                ))}
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #93c5fd, #3b82f6)', border: '2px solid transparent' }}
                onClick={() => handlePlanButtonClick(basicPriceId, 'Basic', 'basic')}
                disabled={checkoutLoading === basicPriceId || (hasPaidPlan && isCurrentPlanLabel('Basic'))}
              >
                {getPlanButtonLabel(basicPriceId, 'Basic')}
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
                {currencySymbol}{priceByPlan.premium}<span className="text-xl sm:text-2xl">/Month</span>
              </div>
              <p style={{ marginTop: '-10px', marginBottom: '18px', color: '#d1fae5', fontWeight: 700 }}>New subscribers: 7 days free, then {currencySymbol}{priceByPlan.premium}/month</p>
              <ul className="space-y-3 mb-8 text-left flex-grow">
                {premiumPlanFeatures.map((feature) => (
                  <li key={feature} className="flex items-start text-white">
                    <span className="mr-2 font-bold" style={{ color: '#7bd4c9' }}>✓</span> {feature}
                  </li>
                ))}
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)', border: '2px solid transparent' }}
                onClick={() => handlePlanButtonClick(premiumPriceId, 'Premium', 'premium')}
                disabled={checkoutLoading === premiumPriceId || (hasPaidPlan && isCurrentPlanLabel('Premium'))}
              >
                {getPlanButtonLabel(premiumPriceId, 'Premium')}
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
                {currencySymbol}{priceByPlan.premiumPlus}<span className="text-xl sm:text-2xl">/Month</span>
              </div>
              <p style={{ marginTop: '-10px', marginBottom: '18px', color: '#ffedd5', fontWeight: 700 }}>New subscribers: 7 days free, then {currencySymbol}{priceByPlan.premiumPlus}/month</p>
              <ul className="space-y-3 mb-8 text-left flex-grow">
                {premiumPlusPlanFeatures.map((feature) => (
                  <li key={feature} className="flex items-start text-white">
                    <span className="mr-2 font-bold" style={{ color: '#f8a76f' }}>✓</span> {feature}
                  </li>
                ))}
              </ul>
              <button
                className="block w-full py-4 px-8 rounded-[26px] text-white font-bold transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'linear-gradient(135deg, #f8a76f, #f26a3d)', border: '2px solid transparent' }}
                onClick={() => handlePlanButtonClick(premiumPlusPriceId, 'Premium +', 'premium-plus')}
                disabled={checkoutLoading === premiumPlusPriceId || (hasPaidPlan && isCurrentPlanLabel('Premium +'))}
              >
                {getPlanButtonLabel(premiumPlusPriceId, 'Premium +')}
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
