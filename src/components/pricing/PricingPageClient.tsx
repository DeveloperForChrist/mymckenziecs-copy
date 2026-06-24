'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { isBillingEligibleUser } from '@/lib/auth/session-user';
import {
  findPlanByAnyPriceId,
  getPlanFeatures,
  getPlanPriceId,
  getBusinessSoloIntroPriceId,
  isKnownPlanPriceId,
  PLAN_PRICES,
  type BillingMarket,
} from '@/constants';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';
import { buildMarketAwareAuthHref } from '@/lib/markets/public-routes';
import { isBillingActiveStripeStatus, isTrialingStripeStatus } from '@/lib/payments/subscription-status';
import styles from '@/components/dashboard/userdashboard.module.css';

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

type PricingAudience = 'individual' | 'professionals';
type PricingCard = {
  key: string;
  name: string;
  description: string;
  price: string;
  period?: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
  priceId?: string;
  planName?: string;
  href?: string;
};

const defaultGuideLinks: PricingGuideLink[] = [
  { href: '/litigant-in-person-uk', label: 'UK self-representation guide' },
  { href: '/mckenzie-friend-support', label: 'McKenzie friend support guide' },
  { href: '/case-law-search-uk', label: 'case-law search guide' },
];

export default function PricingPageClient({
  audienceDescription = 'Use Case workspace to organise your legal matters.',
  availabilityMessage = 'Case-law tools are available now for UK legal matters. U.S. authority coverage and database access will be introduced soon.',
  guideIntroText = 'If you are managing your own matter, start with the',
  guideLinks = defaultGuideLinks,
  faqHref = '/faq',
  billingMarket = 'GB',
  currencySymbol = '£',
  priceByPlan = {
    basic: '18',
    premium: '32',
    premiumPlus: '149',
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
      label.includes('premium +') ||
      label.includes('assistant plus') ||
      label.includes('assistant pro')
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
  const [pricingAudience, setPricingAudience] = useState<PricingAudience>('individual');

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
    if (!hasPaidPlan) return isLapsedStatus ? 'Resume plan' : 'Choose plan';

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
      const matchedPlan = findPlanByAnyPriceId(priceId);
      const redirectTo = getAppRouteForMarket(`/dashboard?activatePlan=${encodeURIComponent(priceId)}`, billingMarket);
      window.location.href = buildMarketAwareAuthHref('/auth/signup', billingMarket, {
        planId: priceId,
        plan: matchedPlan?.name,
        redirect: redirectTo,
      });
      return;
    }

    try {
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
  const assistantPlusPriceId = getPlanPriceId('Assistant Plus', billingMarket);
  const assistantProPriceId = getPlanPriceId('Assistant Pro', billingMarket);
  const businessSoloPriceId = getBusinessSoloIntroPriceId(billingMarket);
  const businessPrice = billingMarket === 'US' ? '54' : '29.99';

  const CASE_LAW_FEATURE = 'Advanced case-law retrieval and study';
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

  const businessSignupHref = () => {
    const params = new URLSearchParams({
      audience: 'business',
      plan: 'Solo',
      redirect: '/business/dashboard',
    });
    if (businessSoloPriceId) params.set('planId', businessSoloPriceId);
    if (billingMarket === 'US') params.set('market', 'US');
    return buildMarketAwareAuthHref('/auth/signup', billingMarket, Object.fromEntries(params.entries()));
  };

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

  const assistantCards: PricingCard[] = [
    {
      key: 'assistant-free',
      name: 'Free',
      description: 'Basic question answering assistant.',
      price: 'Free',
      cta: 'Start free',
      href: '/assistant',
      features: [
        'Saved chats',
        'Limited web searches',
        'Limited messages',
        'No document uploads',
      ],
    },
    {
      key: 'assistant-plus',
      name: 'Assistant Plus',
      description: 'More capable help with document uploads.',
      price: `${currencySymbol}${billingMarket === 'US' ? '15' : '12'}`,
      period: '/month',
      cta: assistantPlusPriceId ? getPlanButtonLabel(assistantPlusPriceId, 'Assistant Plus') : 'Pricing pending',
      highlighted: true,
      priceId: assistantPlusPriceId,
      planName: 'Assistant Plus',
      features: assistantPlusPlanFeatures,
    },
    {
      key: 'assistant-pro',
      name: 'Assistant Pro',
      description: 'Deeper assistant support with saved documents.',
      price: `${currencySymbol}${billingMarket === 'US' ? '59.99' : '49.99'}`,
      period: '/month',
      cta: assistantProPriceId ? getPlanButtonLabel(assistantProPriceId, 'Assistant Pro') : 'Pricing pending',
      priceId: assistantProPriceId,
      planName: 'Assistant Pro',
      features: assistantProPlanFeatures,
    },
  ];

  const workspaceCards: PricingCard[] = [
    {
      key: 'basic',
      name: 'Basic',
      description: 'A lightweight case workspace for organising your matter.',
      price: `${currencySymbol}${priceByPlan.basic}`,
      period: '/month',
      cta: getPlanButtonLabel(basicPriceId, 'Basic'),
      priceId: basicPriceId,
      planName: 'Basic',
      features: basicPlanFeatures,
    },
    {
      key: 'premium',
      name: 'Premium',
      description: 'For ongoing matters with more documents and reminders.',
      price: `${currencySymbol}${priceByPlan.premium}`,
      period: '/month',
      cta: getPlanButtonLabel(premiumPriceId, 'Premium'),
      highlighted: true,
      priceId: premiumPriceId,
      planName: 'Premium',
      features: premiumPlanFeatures,
    },
    {
      key: 'premium-plus',
      name: 'Premium +',
      description: 'For heavier case preparation and deeper research support.',
      price: `${currencySymbol}${priceByPlan.premiumPlus}`,
      period: '/month',
      cta: getPlanButtonLabel(premiumPlusPriceId, 'Premium +'),
      priceId: premiumPlusPriceId,
      planName: 'Premium +',
      features: premiumPlusPlanFeatures,
    },
  ];

  const professionalCards: PricingCard[] = [
    {
      key: 'solo',
      name: 'Solo',
      description: 'Professional dashboard for independent support work.',
      price: `${currencySymbol}${businessPrice}`,
      period: '/month',
      cta: 'Start Solo',
      highlighted: true,
      href: businessSignupHref(),
      features: [
        'One business workspace',
        'Client matters, notes, documents, and deadlines',
        'Business-grade AI assistant',
        'Source-cited research support',
      ],
    },
  ];

  const activeIndividualCards = individualProduct === 'assistant' ? assistantCards : workspaceCards;
  const activeCards = pricingAudience === 'individual' ? activeIndividualCards : professionalCards;

  const renderCard = (card: PricingCard) => {
    const disabled = Boolean(
      card.priceId &&
      (checkoutLoading === card.priceId || (hasPaidPlan && card.planName && isCurrentPlanLabel(card.planName)))
    );

    return (
      <article key={card.key} className={`${styles.card} ${card.highlighted ? styles.highlighted : ''}`}>
        {card.highlighted && <div className={styles.badge}>Popular</div>}
        <div>
          <h2>{card.name}</h2>
          <p className={styles.description}>{card.description}</p>
          <div className={styles.price}>
            <span>{card.price}</span>
            {card.period && <small>{card.period}</small>}
          </div>
        </div>

        <ul className={styles.features}>
          {card.features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>

        {card.href ? (
          <a href={card.href} className={card.highlighted ? styles.primaryButton : styles.secondaryButton}>
            {card.cta}
          </a>
        ) : (
          <button
            type="button"
            className={card.highlighted ? styles.primaryButton : styles.secondaryButton}
            onClick={() => card.priceId && card.planName && handlePlanButtonClick(card.priceId, card.planName, card.key)}
            disabled={disabled}
          >
            {card.cta}
          </button>
        )}
        {checkoutError && checkoutErrorPlanKey === card.key && (
          <p style={{ color: '#fecaca', margin: '0', fontWeight: 700 }}>{checkoutError}</p>
        )}
      </article>
    );
  };

  return (
    <>
      <main className={styles.page}>
        <div style={{ width: 'min(1120px, 100%)', margin: '0 auto' }}>
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
        </div>

        <div style={{ width: 'min(1120px, 100%)', margin: '0 auto' }}>
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
                Access active.
                {nextBillingDate ? ` Next billing date: ${formatPlanDate(nextBillingDate)}.` : ''}
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
        </div>

        <header className={styles.header} style={{ marginBottom: 'clamp(14px, 3vw, 26px)' }}>
          <div>
            <p className={styles.kicker}>
              Pricing
            </p>
            <h1>
              Choose the plan for your needs.
            </h1>
          </div>
        </header>

        <div className={styles.switcherWrap} aria-label="Pricing audience">
          <div className={styles.switcher}>
            <span
              className={styles.switcherThumb}
              style={{ transform: pricingAudience === 'individual' ? 'translateX(0)' : 'translateX(100%)' }}
              aria-hidden="true"
            />
            <button
              type="button"
              className={pricingAudience === 'individual' ? styles.switcherActive : ''}
              onClick={() => setPricingAudience('individual')}
            >
              Individual
            </button>
            <button
              type="button"
              className={pricingAudience === 'professionals' ? styles.switcherActive : ''}
              onClick={() => setPricingAudience('professionals')}
            >
              Professionals
            </button>
          </div>
        </div>

        {checkoutError && !checkoutErrorPlanKey && (
          <div className={styles.errorBox}>{checkoutError}</div>
        )}

        <section
          className={styles.grid}
          style={pricingAudience === 'professionals' ? { gridTemplateColumns: 'minmax(0, 380px)', justifyContent: 'center' } : undefined}
          aria-label={
            pricingAudience === 'professionals'
              ? 'Professional plans'
              : 'Case workspace plans'
          }
        >
          {activeCards.map(renderCard)}
        </section>
      </main>
    </>
  )
}
