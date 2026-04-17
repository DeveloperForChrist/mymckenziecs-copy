"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { hasCaseLawAccess } from '@/lib/plans/access';
import { isTrialingStripeStatus } from '@/lib/payments/subscription-status';
import { PLAN_PRICES } from '@/constants';

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

type DashboardHomeClientProps = {
  initialPlan?: string;
  initialPlanStatus?: string;
  initialNextBillingDate?: string | null;
  initialPlanLoaded?: boolean;
};

export default function DashboardHomeClient({
  initialPlan = 'No plan',
  initialPlanStatus = 'inactive',
  initialNextBillingDate = null,
  initialPlanLoaded = false,
}: DashboardHomeClientProps = {}) {
  const searchParams = useSearchParams();
  const [uid, setUid] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>(initialPlan);
  const [planStatus, setPlanStatus] = useState<string>(initialPlanStatus);
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(initialNextBillingDate);
  const [planLoaded, setPlanLoaded] = useState(Boolean(initialPlanLoaded));
  const [calendarAlertCount, setCalendarAlertCount] = useState(0);
  const [activationPending, setActivationPending] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);

  const hasCaseLawFeature = hasCaseLawAccess(plan);
  const normalizedPlanStatus = planStatus.trim().toLowerCase();
  const isPastDueStatus = normalizedPlanStatus === 'past_due';
  const isTrialingStatus = isTrialingStripeStatus(normalizedPlanStatus);
  const hasPaidAccess =
    normalizedPlanStatus === 'active' ||
    normalizedPlanStatus === 'trialing' ||
    normalizedPlanStatus === 'past_due';
  const selectedPlanId = (searchParams?.get('activatePlan') || '').trim();
  const selectedPlanName =
    PLAN_PRICES.find((entry) => entry.priceId === selectedPlanId)?.name || 'your selected plan';
  const showActivationBanner = planLoaded && !hasPaidAccess;
  const featureAccessLocked = planLoaded && !hasPaidAccess;

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

  useEffect(() => {
    let cancelled = false;
    const sendWelcomeIfVerified = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        if (!data?.user || !data.user.email_confirmed_at) return;
        await fetch('/api/email/welcome', { method: 'POST', credentials: 'include' });
      } catch {
        // no-op
      }
    };
    if (!cancelled && uid) {
      void sendWelcomeIfVerified();
    }
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const handleActivateTrial = async () => {
    if (!selectedPlanId || activationPending) return;

    setActivationPending(true);
    setActivationError(null);
    try {
      const response = await fetch('/api/stripe/plan-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ planId: selectedPlanId }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok && payload?.code === 'EMAIL_VERIFICATION_REQUIRED' && typeof payload?.redirect === 'string') {
        window.location.href = payload.redirect;
        return;
      }

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'Unable to start checkout right now.');
      }

      window.location.href = String(payload.url);
    } catch (error: any) {
      setActivationError(error?.message || 'Unable to start checkout right now.');
    } finally {
      setActivationPending(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadCalendarAlerts = async () => {
      if (!uid) {
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
  }, [uid]);

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
      href: '/chatbot',
      color: '#10b981,#34d399'
    },
    {
      icon: 'bx-edit',
      title: 'Store My Document',
      desc: 'Upload and manage your documents',
      href: '/dashboard/documents',
      color: '#2563eb,#60a5fa'
    },
    {
      icon: 'bx-folder-open',
      title: 'Review My Notes',
      desc: 'Write and organise your notes',
      href: '/dashboard/MyNotes',
      color: '#db2777,#f472b6'
    },
    {
      icon: 'bx-briefcase',
      title: 'Check My Calendar',
      desc: 'Monitor important dates and deadlines',
      href: '/dashboard/calendar',
      color: '#ea580c,#fb923c',
      alertCount: calendarAlertCount,
    },
    {
      icon: 'bx-search',
      title: 'Search Case Law',
      desc: 'Research and study UK case law and judgments',
      href: '/dashboard/case-law-search',
      color: '#f59e42,#fbbf24'
    },
    {
      icon: 'bx-cog',
      title: 'User Settings',
      desc: 'Manage your profile and billing',
      href: '/settings',
      color: '#7c3aed,#22d3ee'
    }
  ];

  const visibleFeatures = features.filter((feature) => {
    if (feature.href === '/dashboard/case-law-search') {
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
                Your account has been verified and registered
              </h2>
              <p style={{ margin: '8px 0 0', color: '#cbd5f5', lineHeight: 1.5, maxWidth: '760px' }}>
                {selectedPlanId
                  ? `Enter your payment details to activate your 7 day free trial for ${selectedPlanName} and access the platform.`
                  : 'Choose a plan and enter your payment details to activate your 7 day free trial and access the platform.'}
              </p>
              <p style={{ margin: '10px 0 0', color: '#d1fae5', lineHeight: 1.45, fontWeight: 600 }}>
                No charge today. Cancel anytime before your trial ends.
              </p>
              <div style={{ marginTop: 14, display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                {selectedPlanId ? (
                  <button
                    type="button"
                    onClick={() => {
                      void handleActivateTrial();
                    }}
                    disabled={activationPending}
                    style={{
                      border: 'none',
                      borderRadius: '999px',
                      background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)',
                      color: '#052a27',
                      padding: '10px 16px',
                      fontWeight: 700,
                      cursor: activationPending ? 'not-allowed' : 'pointer',
                      opacity: activationPending ? 0.75 : 1,
                    }}
                  >
                    {activationPending ? 'Opening checkout…' : 'Activate free trial'}
                  </button>
                ) : (
                  <Link
                    href="/pricing"
                    style={{
                      textDecoration: 'none',
                      borderRadius: '999px',
                      background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)',
                      color: '#052a27',
                      padding: '10px 16px',
                      fontWeight: 700,
                    }}
                  >
                    Choose plan
                  </Link>
                )}
                <Link
                  href="/pricing"
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
                  Change plan
                </Link>
              </div>
              {activationError && (
                <p style={{ margin: '12px 0 0', color: '#fecaca', lineHeight: 1.45 }}>
                  {activationError}
                </p>
              )}
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
                  href="/settings"
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
                  href="/settings?tab=billing"
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
                    cursor: featureAccessLocked ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '100%',
                    minHeight: cardMinHeight,
                    position: 'relative',
                    opacity: featureAccessLocked ? 0.55 : 1,
                    filter: featureAccessLocked ? 'grayscale(0.12)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (featureAccessLocked) return;
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
                    {featureAccessLocked && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '14px',
                          left: '14px',
                          borderRadius: '999px',
                          padding: '6px 10px',
                          background: 'rgba(15, 23, 42, 0.84)',
                          color: '#f8fafc',
                          fontSize: '0.77rem',
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                        }}
                      >
                        Activate trial first
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

              if (featureAccessLocked) {
                return (
                  <div key={idx} aria-disabled="true">
                    {card}
                  </div>
                );
              }

              return (
                <Link
                  key={idx}
                  href={feature.href}
                  prefetch={feature.href === '/settings' ? false : undefined}
                  style={{ textDecoration: 'none' }}
                >
                  {card}
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
