"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import { hasCaseLawAccess } from '@/lib/plans/access';

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
  const [uid, setUid] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>(initialPlan);
  const [planStatus, setPlanStatus] = useState<string>(initialPlanStatus);
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(initialNextBillingDate);
  const [planLoaded, setPlanLoaded] = useState(Boolean(initialPlanLoaded));
  const [calendarAlertCount, setCalendarAlertCount] = useState(0);

  const hasCaseLawFeature = hasCaseLawAccess(plan);
  const normalizedPlanStatus = planStatus.trim().toLowerCase();
  const isPastDueStatus = normalizedPlanStatus === 'past_due';

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
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: 'clamp(16px, 3vw, 28px) clamp(12px, 3vw, 20px) 20px' }}>
          <div style={{ marginBottom: '28px' }}>
            <h1 style={{ fontSize: 'clamp(1.8rem, 5vw, 2.5rem)', fontWeight: 700, marginBottom: '12px', lineHeight: 1.2 }}>
              Welcome to MyMcKenzieCS
            </h1>
            <p style={{ fontSize: 'clamp(0.96rem, 2.9vw, 1.1rem)', color: 'rgba(255,255,255,0.7)', maxWidth: '600px', lineHeight: 1.6 }}>
              Access your tools and manage your legal matters with AI-powered assistance.
            </p>
          </div>

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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(250px, 100%), 1fr))', gap: 'clamp(14px, 2.6vw, 24px)', marginBottom: '16px' }}>
            {visibleFeatures.map((feature, idx) => (
              <Link
                key={idx}
                href={feature.href}
                prefetch={feature.href === '/settings' ? false : undefined}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  background: `linear-gradient(135deg, ${feature.color})`,
                  padding: 'clamp(18px, 3.8vw, 30px) clamp(16px, 3.4vw, 24px)',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%',
                  minHeight: 'clamp(170px, 34vw, 220px)',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-8px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = '0 20px 40px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                }}>
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
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
