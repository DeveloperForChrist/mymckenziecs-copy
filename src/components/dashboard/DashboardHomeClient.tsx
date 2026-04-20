"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { hasCaseLawAccess } from '@/lib/plans/access';
import { isTrialingStripeStatus } from '@/lib/payments/subscription-status';
import { findPlanByAnyPriceId } from '@/constants';
import InAppPaymentMethodModal from '@/components/settings/InAppPaymentMethodModal';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';
import { getPublicRouteForMarket, normalizePublicMarket, type PublicMarket } from '@/lib/markets/public-routes';

function formatDateLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

type DashboardHomeClientProps = {
  initialEmailVerified?: boolean;
  initialPlan?: string;
  initialPlanStatus?: string;
  initialNextBillingDate?: string | null;
  initialHasStripeCustomer?: boolean;
  initialCancelAtPeriodEnd?: boolean;
  initialCaseLawAvailable?: boolean;
  initialPlanLoaded?: boolean;
  initialPublicMarket?: PublicMarket;
};

export default function DashboardHomeClient({
  initialEmailVerified = false,
  initialPlan = 'No plan',
  initialPlanStatus = 'inactive',
  initialNextBillingDate = null,
  initialHasStripeCustomer = false,
  initialCancelAtPeriodEnd = false,
  initialCaseLawAvailable = false,
  initialPlanLoaded = false,
  initialPublicMarket = 'GB',
}: DashboardHomeClientProps = {}) {
  const searchParams = useSearchParams();
  const [uid, setUid] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(Boolean(initialEmailVerified));
  const [plan, setPlan] = useState<string>(initialPlan);
  const [planStatus, setPlanStatus] = useState<string>(initialPlanStatus);
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(initialNextBillingDate);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(Boolean(initialHasStripeCustomer));
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(Boolean(initialCancelAtPeriodEnd));
  const [planLoaded, setPlanLoaded] = useState(Boolean(initialPlanLoaded));
  const [publicMarket, setPublicMarket] = useState<PublicMarket>(initialPublicMarket);
  const [calendarAlertCount, setCalendarAlertCount] = useState(0);
  const [trialStartPending, setTrialStartPending] = useState(false);
  const [trialStartError, setTrialStartError] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentSaveMessage, setPaymentSaveMessage] = useState<string | null>(null);
  const [trialReminderDismissed, setTrialReminderDismissed] = useState(false);
  const trialStartAttemptedRef = useRef(false);

  const hasCaseLawFeature = publicMarket !== 'US' && initialCaseLawAvailable && hasCaseLawAccess(plan);
  const normalizedPlanStatus = planStatus.trim().toLowerCase();
  const isPastDueStatus = normalizedPlanStatus === 'past_due';
  const isTrialingStatus = isTrialingStripeStatus(normalizedPlanStatus);
  const hasPaidAccess =
    normalizedPlanStatus === 'active' ||
    normalizedPlanStatus === 'trialing' ||
    normalizedPlanStatus === 'past_due';
  const selectedPlanId = (searchParams?.get('activatePlan') || '').trim();
  const selectedPlanName =
    findPlanByAnyPriceId(selectedPlanId)?.name || 'your selected plan';
  const pricingHref = getPublicRouteForMarket('/pricing', normalizePublicMarket(publicMarket));
  const dashboardHref = getAppRouteForMarket('/dashboard', normalizePublicMarket(publicMarket));
  const chatbotHref = getAppRouteForMarket('/chatbot', normalizePublicMarket(publicMarket));
  const documentsHref = getAppRouteForMarket('/dashboard/documents', normalizePublicMarket(publicMarket));
  const notesHref = getAppRouteForMarket('/dashboard/MyNotes', normalizePublicMarket(publicMarket));
  const calendarHref = getAppRouteForMarket('/dashboard/calendar', normalizePublicMarket(publicMarket));
  const caseLawHref = getAppRouteForMarket('/dashboard/case-law-search', normalizePublicMarket(publicMarket));
  const settingsHref = getAppRouteForMarket('/settings', normalizePublicMarket(publicMarket));
  const billingSettingsHref = getAppRouteForMarket('/settings?tab=billing', normalizePublicMarket(publicMarket));
  const showActivationBanner = planLoaded && emailVerified && (!hasPaidAccess || trialStartPending || Boolean(trialStartError));
  const trialDaysLeft = isTrialingStatus ? daysUntil(nextBillingDate) : null;
  const showTrialBillingReminderBanner =
    isTrialingStatus &&
    !hasStripeCustomer &&
    !cancelAtPeriodEnd &&
    typeof trialDaysLeft === 'number' &&
    trialDaysLeft >= 1 &&
    trialDaysLeft <= 3 &&
    !trialReminderDismissed;
  const trialReminderStorageKey =
    uid && isTrialingStatus && typeof trialDaysLeft === 'number' && nextBillingDate
      ? `trial-billing-reminder-dismissed:${uid}:${nextBillingDate}:${trialDaysLeft}`
      : null;

  useEffect(() => {
    setEmailVerified(Boolean(initialEmailVerified));
  }, [initialEmailVerified]);

  useEffect(() => {
    if (!trialReminderStorageKey) {
      setTrialReminderDismissed(false);
      return;
    }

    try {
      setTrialReminderDismissed(window.localStorage.getItem(trialReminderStorageKey) === '1');
    } catch {
      setTrialReminderDismissed(false);
    }
  }, [trialReminderStorageKey]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => {
      setUid(data?.user?.id || null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPlan = async () => {
      try {
        const res = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        setPlan((data?.plan || 'No plan').toString());
        setPlanStatus((data?.planStatus || 'inactive').toString().trim().toLowerCase());
        setNextBillingDate(typeof data?.nextBillingDate === 'string' ? data.nextBillingDate : null);
        setHasStripeCustomer(Boolean(data?.hasStripeCustomer));
        setCancelAtPeriodEnd(Boolean(data?.cancelAtPeriodEnd));
        setPublicMarket(normalizePublicMarket(data?.publicMarket));
      } catch {
        // Keep preloaded state on transient fetch failures.
      } finally {
        if (!cancelled) setPlanLoaded(true);
      }
    };
    void loadPlan();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshPlanState = async () => {
    const res = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    setPlan((data?.plan || 'No plan').toString());
    setPlanStatus((data?.planStatus || 'inactive').toString().trim().toLowerCase());
    setNextBillingDate(typeof data?.nextBillingDate === 'string' ? data.nextBillingDate : null);
    setHasStripeCustomer(Boolean(data?.hasStripeCustomer));
    setCancelAtPeriodEnd(Boolean(data?.cancelAtPeriodEnd));
    setPublicMarket(normalizePublicMarket(data?.publicMarket));
  };

  const dismissTrialReminderBanner = () => {
    setTrialReminderDismissed(true);
    if (!trialReminderStorageKey) return;

    try {
      window.localStorage.setItem(trialReminderStorageKey, '1');
    } catch {
      // Ignore local storage failures and still dismiss for the current view.
    }
  };

  useEffect(() => {
    const sendWelcomeIfVerified = async () => {
      try {
        await fetch('/api/email/welcome', { method: 'POST', credentials: 'include' });
      } catch {
        // no-op
      }
    };
    if (uid && emailVerified) {
      void sendWelcomeIfVerified();
    }
  }, [emailVerified, uid]);

  useEffect(() => {
    trialStartAttemptedRef.current = false;
    setTrialStartPending(false);
    setTrialStartError(null);
  }, [selectedPlanId]);

  useEffect(() => {
    if (!selectedPlanId || !emailVerified || !planLoaded || hasPaidAccess || trialStartAttemptedRef.current) {
      return;
    }

    let cancelled = false;
    trialStartAttemptedRef.current = true;
    setTrialStartPending(true);
    setTrialStartError(null);

    const startTrial = async () => {
      try {
        const response = await fetch('/api/user/start-trial', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ planId: selectedPlanId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          if (payload?.code === 'EMAIL_VERIFICATION_REQUIRED' && typeof payload?.redirect === 'string') {
            window.location.href = payload.redirect;
            return;
          }

          setTrialStartError(
            payload?.code === 'TRIAL_ALREADY_USED'
              ? 'Your previous free trial has already been used. You can still use your dashboard now and add billing information whenever you are ready to continue on this plan.'
              : payload?.error || 'We could not start your selected free trial automatically. You can still use your dashboard now and review billing whenever you are ready.'
          );
          return;
        }

        const planData = payload?.planData || {};
        setPlan((planData?.plan || selectedPlanName).toString());
        setPlanStatus((planData?.planStatus || 'inactive').toString().trim().toLowerCase());
        setNextBillingDate(typeof planData?.nextBillingDate === 'string' ? planData.nextBillingDate : null);
        setHasStripeCustomer(Boolean(planData?.hasStripeCustomer));
        setCancelAtPeriodEnd(Boolean(planData?.cancelAtPeriodEnd));
      } catch (error: any) {
        if (cancelled) return;
        setTrialStartError(error?.message || 'We could not start your selected free trial automatically. You can still use your dashboard now.');
      } finally {
        if (!cancelled) {
          setTrialStartPending(false);
        }
      }
    };

    void startTrial();
    return () => {
      cancelled = true;
    };
  }, [emailVerified, hasPaidAccess, planLoaded, selectedPlanId, selectedPlanName]);

  useEffect(() => {
    let cancelled = false;

    const loadCalendarAlerts = async () => {
      if (!uid || !emailVerified) {
        if (!cancelled) setCalendarAlertCount(0);
        return;
      }
      try {
        const response = await fetch('/api/calendar/alerts?windowDays=7', { credentials: 'include', cache: 'no-store' });
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        const nextCount = typeof payload?.count === 'number' ? payload.count : 0;
        if (!cancelled) setCalendarAlertCount(nextCount);
      } catch {
        if (!cancelled) setCalendarAlertCount(0);
      }
    };

    void loadCalendarAlerts();
    return () => {
      cancelled = true;
    };
  }, [emailVerified, uid]);

  const features: Array<{
    icon: string;
    title: string;
    desc: string;
    href: string;
    color: string;
    badge?: string;
    alertCount?: number;
  }> = [
    {
      icon: 'bx-message-dots',
      title: 'Talk to MyMcKenzieCS Assistant',
      desc: 'Receive AI-assisted legal information and support',
      href: chatbotHref,
      color: '#10b981,#34d399'
    },
    {
      icon: 'bx-edit',
      title: 'Store My Document',
      desc: 'Upload and manage your documents',
      href: documentsHref,
      color: '#2563eb,#60a5fa'
    },
    {
      icon: 'bx-folder-open',
      title: 'Review My Notes',
      desc: 'Write and organise your notes',
      href: notesHref,
      color: '#db2777,#f472b6'
    },
    {
      icon: 'bx-briefcase',
      title: 'Check My Calendar',
      desc: 'Monitor important dates and deadlines',
      href: calendarHref,
      color: '#ea580c,#fb923c',
      alertCount: calendarAlertCount,
    },
    {
      icon: 'bx-search',
      title: 'Search Case Law',
      desc: 'Research and study case law and judgments where available',
      href: caseLawHref,
      color: '#f59e42,#fbbf24'
    },
    {
      icon: 'bx-cog',
      title: 'User Settings',
      desc: 'Manage your profile and billing',
      href: settingsHref,
      color: '#7c3aed,#22d3ee'
    }
  ];

  const visibleFeatures = features.filter((feature) => {
    if (feature.href === caseLawHref) {
      return planLoaded && hasCaseLawFeature;
    }
    return true;
  });
  const desktopCardMinWidth = visibleFeatures.length <= 5 ? 260 : 285;
  const cardMinWidthCss = `clamp(240px, 24vw, ${desktopCardMinWidth}px)`;
  const layoutMaxWidth = 'var(--app-shell-max-width, 1720px)';
  const layoutPadding = 'var(--app-shell-padding-block, 20px) var(--app-shell-padding-inline, 18px) calc(var(--app-shell-padding-block, 20px) + 8px)';
  const gridGap = 'clamp(14px, 1.8vw, 24px)';
  const cardMinHeight = 'clamp(210px, 24vw, 280px)';

  if (!planLoaded) {
    return (
      <div style={{ background: 'linear-gradient(135deg, #240724 0%, #240724 50%, #240724 100%)', minHeight: '100vh' }}>
        <main style={{ minHeight: '100vh', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div
              className="animate-spin"
              style={{
                width: 28,
                height: 28,
                border: '3px solid rgba(255, 255, 255, 0.35)',
                borderTopColor: '#ffffff',
                borderRadius: '9999px'
              }}
            />
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }}>Loading...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, #240724 0%, #240724 50%, #240724 100%)', minHeight: '100vh' }}>
      <main style={{ color: '#ffffff' }}>
        <div style={{ maxWidth: layoutMaxWidth, margin: '0 auto', padding: layoutPadding }}>
          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ fontSize: 'clamp(1.9rem, 4.4vw, 2.85rem)', fontWeight: 700, marginBottom: '12px', lineHeight: 1.2 }}>
              Welcome to MyMcKenzieCS
            </h1>
            <p style={{ fontSize: 'clamp(1rem, 2.7vw, 1.16rem)', color: 'rgba(255,255,255,0.7)', maxWidth: '680px', lineHeight: 1.6 }}>
              Access your tools and manage your legal matters with AI-powered assistance.
            </p>
          </div>

          {showActivationBanner && (
            <section
              style={{
                marginBottom: '26px',
                borderRadius: '18px',
                border: '1px solid rgba(125, 211, 252, 0.38)',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(30, 41, 59, 0.66))',
                padding: '18px 18px 16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700, color: '#f8fafc' }}>
                Your workspace is ready
              </h2>
              <p style={{ margin: '8px 0 0', color: '#cbd5f5', lineHeight: 1.5, maxWidth: '760px' }}>
                {trialStartPending && selectedPlanId
                  ? `Your email is verified and your tools are unlocked. We are starting your ${selectedPlanName} free trial now, and you can begin using the platform straight away.`
                  : selectedPlanId
                    ? `Your email is verified and your tools are unlocked. You can start using the platform now, and your ${selectedPlanName} plan will be ready as soon as billing is in place.`
                  : 'Your email is verified and your tools are unlocked. You can start using the platform now and explore paid plans later if you want expanded features.'}
              </p>
              <p style={{ margin: '10px 0 0', color: '#d1fae5', lineHeight: 1.45, fontWeight: 600 }}>
                Billing and payment methods stay available whenever you decide to review them.
              </p>
              {trialStartError && (
                <p style={{ margin: '10px 0 0', color: '#fecaca', lineHeight: 1.45 }}>
                  {trialStartError}
                </p>
              )}
              <div style={{ marginTop: 14, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Link
                  href={pricingHref}
                  style={{
                    textDecoration: 'none',
                    borderRadius: '999px',
                    background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)',
                    color: '#052a27',
                    padding: '10px 16px',
                    fontWeight: 700,
                  }}
                >
                  Try for free
                </Link>
                <Link
                  href={billingSettingsHref}
                  style={{
                    textDecoration: 'none',
                    border: '1px solid rgba(255,255,255,0.22)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    borderRadius: '999px',
                    padding: '9px 14px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                  }}
                >
                  Open billing settings
                </Link>
              </div>
            </section>
          )}

          {showTrialBillingReminderBanner && (
            <section
              style={{
                marginBottom: '26px',
                borderRadius: '14px',
                border: '1px solid rgba(251, 191, 36, 0.42)',
                background: 'linear-gradient(135deg, rgba(92, 53, 10, 0.38), rgba(59, 34, 6, 0.28))',
                padding: '14px 16px',
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={dismissTrialReminderBanner}
                aria-label="Dismiss billing reminder"
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.75)',
                  cursor: 'pointer',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  lineHeight: 1,
                  padding: '4px 6px',
                }}
              >
                ×
              </button>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fde68a' }}>
                Add billing information before your trial ends
              </h2>
              <p style={{ margin: '8px 0 0', color: '#fef3c7', lineHeight: 1.45 }}>
                {trialDaysLeft === 1
                  ? `Your free trial ends tomorrow on ${formatDateLabel(nextBillingDate)}. Add your billing information now if you want access to continue without interruption.`
                  : `Your free trial ends in ${trialDaysLeft} days on ${formatDateLabel(nextBillingDate)}. Add your billing information before then if you want access to continue without interruption.`}
              </p>
              {paymentSaveMessage && (
                <p style={{ margin: '10px 0 0', color: '#d1fae5', lineHeight: 1.45 }}>
                  {paymentSaveMessage}
                </p>
              )}
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentSaveMessage(null);
                    setPaymentModalOpen(true);
                  }}
                  style={{
                    border: '1px solid rgba(255,255,255,0.24)',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    borderRadius: '999px',
                    padding: '7px 12px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                  }}
                >
                  Set up billing information
                </button>
                <Link
                  href={billingSettingsHref}
                  style={{
                    textDecoration: 'none',
                    border: '1px solid rgba(255,255,255,0.24)',
                    background: 'transparent',
                    color: '#fff',
                    borderRadius: '999px',
                    padding: '7px 12px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    marginLeft: '10px',
                  }}
                >
                  Open billing settings
                </Link>
              </div>
            </section>
          )}

          {isPastDueStatus && (
            <section
              style={{
                marginBottom: '26px',
                borderRadius: '14px',
                border: '1px solid rgba(251, 191, 36, 0.42)',
                background: 'linear-gradient(135deg, rgba(92, 53, 10, 0.38), rgba(59, 34, 6, 0.28))',
                padding: '14px 16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fde68a' }}>
                Billing action needed
              </h2>
              <p style={{ margin: '8px 0 0', color: '#fef3c7', lineHeight: 1.45 }}>
                We weren't able to collect the payment, so your service may stop soon unless it's fixed. Reactivate to continue.
                {nextBillingDate ? ` Next billing date: ${formatDateLabel(nextBillingDate)}.` : ''}
              </p>
              <div style={{ marginTop: 12 }}>
                <Link
                  href={settingsHref}
                  style={{
                    textDecoration: 'none',
                    border: '1px solid rgba(255,255,255,0.24)',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    borderRadius: '999px',
                    padding: '7px 12px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                  }}
                >
                  Open billing settings
                </Link>
              </div>
            </section>
          )}
          {isTrialingStatus && (
            <section
              style={{
                marginBottom: '26px',
                borderRadius: '14px',
                border: '1px solid rgba(125, 211, 252, 0.42)',
                background: 'linear-gradient(135deg, rgba(8, 47, 73, 0.38), rgba(15, 23, 42, 0.28))',
                padding: '14px 16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#dbeafe' }}>
                Free trial active
              </h2>
              <p style={{ margin: '8px 0 0', color: '#bfdbfe', lineHeight: 1.45 }}>
                Your workspace is fully active during the free trial.
                {nextBillingDate ? ` First charge date: ${formatDateLabel(nextBillingDate)}.` : ''}
              </p>
              <div style={{ marginTop: 12 }}>
                <Link
                  href={billingSettingsHref}
                  style={{
                    textDecoration: 'none',
                    border: '1px solid rgba(255,255,255,0.24)',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                    borderRadius: '999px',
                    padding: '7px 12px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                  }}
                >
                  Open billing settings
                </Link>
              </div>
            </section>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(auto-fit, minmax(min(${cardMinWidthCss}, 100%), 1fr))`,
              gap: gridGap,
              marginBottom: '18px',
            }}
          >
            {visibleFeatures.map((feature, idx) => {
              const card = (
                <div
                  style={{
                    background: `linear-gradient(135deg, ${feature.color})`,
                    padding: 'clamp(22px, 4.4vw, 36px) clamp(18px, 3.8vw, 28px)',
                    borderRadius: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                    minHeight: cardMinHeight,
                    position: 'relative',
                    opacity: 1,
                    filter: 'none',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-8px)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                  }}
                >
                  <div>
                    {typeof feature.alertCount === 'number' && feature.alertCount > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '14px',
                          right: '14px',
                          minWidth: '31px',
                          height: '31px',
                          borderRadius: '999px',
                          padding: '0 9px',
                          background: 'rgba(127, 29, 29, 0.92)',
                          color: '#fff',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 8px 18px rgba(0,0,0,0.24)',
                        }}
                        aria-label={`${feature.alertCount} upcoming calendar event${feature.alertCount === 1 ? '' : 's'}`}
                      >
                        {feature.alertCount > 99 ? '99+' : feature.alertCount}
                      </div>
                    )}
                    <i className={`bx ${feature.icon}`} style={{ fontSize: 'clamp(1.9rem, 7vw, 2.45rem)', display: 'block', marginBottom: '14px', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }} />
                    <h3 style={{ fontSize: 'clamp(1.2rem, 4.6vw, 1.55rem)', fontWeight: 600, marginBottom: '10px' }}>{feature.title}</h3>
                    <p style={{ fontSize: 'clamp(0.93rem, 3.1vw, 1.04rem)', opacity: 0.9, marginBottom: '8px', lineHeight: 1.45 }}>{feature.desc}</p>
                  </div>
                  {feature.badge && (
                    <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.2)', padding: '5px 10px', borderRadius: '20px', width: 'fit-content' }}>
                      {feature.badge}
                    </span>
                  )}
                </div>
              );

              return (
                <Link
                  key={idx}
                  href={feature.href}
                  prefetch={feature.href === settingsHref ? false : undefined}
                  style={{ textDecoration: 'none' }}
                >
                  {card}
                </Link>
              );
            })}
          </div>
        </div>
      </main>
      <InAppPaymentMethodModal
        open={paymentModalOpen}
        hasExistingPaymentMethod={false}
        isTrialing={isTrialingStatus}
        onClose={() => {
          setPaymentModalOpen(false);
        }}
        onSuccess={async () => {
          setPaymentModalOpen(false);
          setPaymentSaveMessage('Billing information saved. Your card will be used only if you continue after the free trial ends.');
          await refreshPlanState().catch(() => null);
        }}
        onOpenPortalFallback={() => {
          setPaymentModalOpen(false);
          window.location.href = billingSettingsHref;
        }}
        portalPending={false}
      />
    </div>
  );
}
