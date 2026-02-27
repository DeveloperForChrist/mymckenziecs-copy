"use client";
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import Link from 'next/link';
import { hasCaseLawAccess, hasCaseProfileAccess, isPaidPlan } from '@/lib/plans/access';

type RecentActivityItem = {
  id: string;
  icon: string;
  title: string;
  detail: string;
  when: string;
  href: string;
};

type NotificationItem = {
  id: string;
  level: 'info' | 'success' | 'warning' | 'critical';
  title: string;
  detail: string;
  actionLabel?: string;
  actionType?: 'resend_verification' | 'open_href';
  href?: string;
  email?: string;
};

function formatWhen(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function truncateText(input: string, max = 96) {
  if (input.length <= max) return input;
  return `${input.slice(0, max).trim()}...`;
}

export default function DashboardPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('free');
  const [planLoaded, setPlanLoaded] = useState(false);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [recentActivityLoading, setRecentActivityLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>([]);
  const [dismissedRecentActivityIds, setDismissedRecentActivityIds] = useState<string[]>([]);
  const [notificationNotice, setNotificationNotice] = useState('');
  const [resendVerificationLoading, setResendVerificationLoading] = useState(false);
  const hasCaseProfileFeature = hasCaseProfileAccess(plan);
  const hasCaseLawFeature = hasCaseLawAccess(plan);
  const hasPaidPlan = isPaidPlan(plan);

  const notificationsStorageKey = uid ? `dashboard-dismissed-notifications:${uid}` : null;
  const recentActivityStorageKey = uid ? `dashboard-dismissed-recent-activity:${uid}` : null;

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
    // No-op: dashboard no longer tracks an "active case" context.
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setDismissedNotificationIds([]);
      setDismissedRecentActivityIds([]);
      return;
    }

    try {
      const rawNotifications = window.localStorage.getItem(`dashboard-dismissed-notifications:${uid}`);
      const rawRecentActivity = window.localStorage.getItem(`dashboard-dismissed-recent-activity:${uid}`);
      const parsedNotifications = JSON.parse(rawNotifications || '[]');
      const parsedRecentActivity = JSON.parse(rawRecentActivity || '[]');

      setDismissedNotificationIds(Array.isArray(parsedNotifications) ? parsedNotifications : []);
      setDismissedRecentActivityIds(Array.isArray(parsedRecentActivity) ? parsedRecentActivity : []);
    } catch {
      setDismissedNotificationIds([]);
      setDismissedRecentActivityIds([]);
    }
  }, [uid]);

  useEffect(() => {
    if (!notificationsStorageKey) return;
    window.localStorage.setItem(notificationsStorageKey, JSON.stringify(dismissedNotificationIds));
  }, [notificationsStorageKey, dismissedNotificationIds]);

  useEffect(() => {
    if (!recentActivityStorageKey) return;
    window.localStorage.setItem(recentActivityStorageKey, JSON.stringify(dismissedRecentActivityIds));
  }, [recentActivityStorageKey, dismissedRecentActivityIds]);

  useEffect(() => {
    let cancelled = false;
    const loadPlan = async () => {
      try {
        const res = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
        const data = await res.json();
        if (cancelled) return;
        setPlan((data?.plan || 'free').toString());
      } catch {
        if (!cancelled) setPlan('free');
      } finally {
        if (!cancelled) setPlanLoaded(true);
      }
    };
    loadPlan();
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
      sendWelcomeIfVerified();
    }
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;

    const loadNotifications = async () => {
      if (!uid || !planLoaded || !hasPaidPlan) {
        if (!cancelled) {
          setNotifications([]);
          setNotificationsLoading(false);
        }
        return;
      }

      setNotificationsLoading(true);
      try {
        const res = await fetch('/api/user/notifications', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('Notifications unavailable');
        }
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
      } catch {
        if (cancelled) return;
        setNotifications([]);
      } finally {
        if (!cancelled) {
          setNotificationsLoading(false);
        }
      }
    };

    void loadNotifications();
    return () => {
      cancelled = true;
    };
  }, [uid, planLoaded, hasPaidPlan]);

  const handleNotificationAction = async (item: NotificationItem) => {
    if (item.actionType !== 'resend_verification') return;
    if (!item.email) {
      setNotificationNotice('Unable to resend verification right now. Please sign out and sign back in.');
      return;
    }

    setResendVerificationLoading(true);
    setNotificationNotice('');
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: item.email,
          redirect: '/dashboard',
        }),
      });
      setNotificationNotice('Verification email sent. Please check your inbox.');
    } catch {
      setNotificationNotice('Verification email sent. Please check your inbox.');
    } finally {
      setResendVerificationLoading(false);
    }
  };

  const dismissNotification = (id: string) => {
    setDismissedNotificationIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const dismissRecentActivity = (id: string) => {
    setDismissedRecentActivityIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  useEffect(() => {
    if (!planLoaded) return;

    let cancelled = false;

    const loadRecentActivity = async () => {
      if (!uid) {
        if (!cancelled) {
          setRecentActivity([]);
          setRecentActivityLoading(false);
        }
        return;
      }

      setRecentActivityLoading(true);

      try {
        const supabase = getSupabaseBrowserClient();
        const nowIso = new Date().toISOString();

        const [caseResult, documentResult, messageResult, eventResult] = await Promise.all([
          supabase
            .from('cases')
            .select('id, title, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('documents')
            .select('id, name, created_at')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('messages')
            .select('id, content, timestamp')
            .eq('role', 'user')
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('calendar_events')
            .select('id, title, date')
            .eq('completed', false)
            .gte('date', nowIso)
            .order('date', { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const items: RecentActivityItem[] = [];

        if (eventResult.data) {
          items.push({
            id: `event-${eventResult.data.id}`,
            icon: 'bx-calendar-event',
            title: 'Upcoming deadline',
            detail: eventResult.data.title || 'Next event scheduled',
            when: formatWhen(eventResult.data.date),
            href: '/dashboard/calendar',
          });
        }

        if (documentResult.data) {
          items.push({
            id: `doc-${documentResult.data.id}`,
            icon: 'bx-file',
            title: 'Latest document upload',
            detail: documentResult.data.name || 'Document uploaded',
            when: formatWhen(documentResult.data.created_at),
            href: '/dashboard/documents',
          });
        }

        if (messageResult.data) {
          items.push({
            id: `message-${messageResult.data.id}`,
            icon: 'bx-message-detail',
            title: 'Latest assistant thread',
            detail: truncateText(messageResult.data.content || 'You sent a message'),
            when: formatWhen(messageResult.data.timestamp),
            href: '/chatbot',
          });
        }

        if (caseResult.data && hasCaseProfileFeature) {
          items.push({
            id: `case-${caseResult.data.id}`,
            icon: 'bx-id-card',
            title: 'Case profile updated',
            detail: caseResult.data.title || 'Case details changed',
            when: formatWhen(caseResult.data.updated_at),
            href: '/dashboard/case-profile',
          });
        }

        if (items.length === 0) {
          items.push({
            id: 'onboarding',
            icon: 'bx-rocket',
            title: 'No recent activity yet',
            detail: hasCaseProfileFeature
              ? 'Start in Case Profile to set case number, title, hearing date, and summary.'
              : 'Start in Assistant to ask your first legal question and begin your workflow.',
            when: '',
            href: hasCaseProfileFeature ? '/dashboard/case-profile' : '/chatbot',
          });
        }

        setRecentActivity(items);
      } catch {
        if (!cancelled) {
          setRecentActivity([
            {
              id: 'fallback',
              icon: 'bx-time-five',
              title: 'Recent activity unavailable',
              detail: 'Open your tools below to continue your case workflow.',
              when: '',
              href: hasCaseProfileFeature ? '/dashboard/case-profile' : '/chatbot',
            },
          ]);
        }
      } finally {
        if (!cancelled) {
          setRecentActivityLoading(false);
        }
      }
    };

    void loadRecentActivity();

    return () => {
      cancelled = true;
    };
  }, [uid, hasCaseProfileFeature, planLoaded]);

  const features: Array<{
    icon: string;
    title: string;
    desc: string;
    href: string;
    color: string;
    badge?: string;
  }> = [
    {
      icon: 'bx-id-card',
      title: 'Case Profile',
      desc: 'Create and manage your case profile details',
      href: '/dashboard/case-profile',
      color: '#6366f1,#22d3ee'
    },
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
      color: '#ea580c,#fb923c'
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
      desc: 'Manage your profile, billing, and alerts',
      href: '/settings',
      color: '#7c3aed,#22d3ee'
    }
  ];

  const visibleFeatures = features.filter((feature) => {
    if (feature.href === '/dashboard/case-profile') {
      return hasCaseProfileFeature;
    }
    if (feature.href === '/dashboard/case-law-search') {
      return planLoaded && hasCaseLawFeature;
    }
    return true;
  });

  const visibleNotifications = notifications.filter((item) => !dismissedNotificationIds.includes(item.id));
  const visibleRecentActivity = recentActivity.filter((item) => !dismissedRecentActivityIds.includes(item.id));
  const updatesLoading = recentActivityLoading || (hasPaidPlan && notificationsLoading);
  const mergedUpdates: Array<
    | { kind: 'notification'; item: NotificationItem }
    | { kind: 'activity'; item: RecentActivityItem }
  > = [
    ...(hasPaidPlan ? visibleNotifications.map((item) => ({ kind: 'notification' as const, item })) : []),
    ...visibleRecentActivity.map((item) => ({ kind: 'activity' as const, item })),
  ];

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
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '28px 20px 20px' }}>
          {/* Welcome Section */}
          <div style={{ marginBottom: '34px' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '12px', lineHeight: 1.2 }}>
              Welcome to MyMcKenzieCS
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.7)', maxWidth: '600px', lineHeight: 1.6 }}>
              Access your tools and manage your legal matters with AI-powered assistance.
            </p>
          </div>

          <section style={{ marginBottom: '42px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Updates and Notifications</h2>
              <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem' }}>
                {updatesLoading ? 'Loading...' : `${mergedUpdates.length} item${mergedUpdates.length === 1 ? '' : 's'}`}
              </span>
            </div>
            <div
              className="updates-rail"
              style={{
                display: 'flex',
                gap: '12px',
                overflowX: 'auto',
                overflowY: 'hidden',
                paddingBottom: '6px',
                scrollSnapType: 'x proximity',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {mergedUpdates.map((entry) => {
                if (entry.kind === 'notification') {
                  const item = entry.item;
                  const tone = item.level === 'critical'
                    ? { border: '1px solid rgba(248, 113, 113, 0.45)', bg: 'linear-gradient(135deg, rgba(127, 29, 29, 0.42), rgba(68, 13, 13, 0.35))', icon: 'bx-error-circle', iconColor: '#fca5a5' }
                    : item.level === 'warning'
                      ? { border: '1px solid rgba(251, 191, 36, 0.40)', bg: 'linear-gradient(135deg, rgba(92, 53, 10, 0.38), rgba(59, 34, 6, 0.28))', icon: 'bx-error', iconColor: '#fde68a' }
                      : item.level === 'success'
                        ? { border: '1px solid rgba(52, 211, 153, 0.35)', bg: 'linear-gradient(135deg, rgba(4, 120, 87, 0.35), rgba(6, 78, 59, 0.26))', icon: 'bx-check-circle', iconColor: '#86efac' }
                        : { border: '1px solid rgba(148, 163, 184, 0.35)', bg: 'linear-gradient(135deg, rgba(30, 41, 59, 0.35), rgba(30, 41, 59, 0.22))', icon: 'bx-info-circle', iconColor: '#bfdbfe' };

                  return (
                    <article
                      key={`n-${item.id}`}
                      style={{
                        borderRadius: '12px',
                        border: tone.border,
                        background: tone.bg,
                        padding: '9px',
                        minHeight: '76px',
                        flex: '0 0 min(310px, 84vw)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        scrollSnapAlign: 'start',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <i className={`bx ${tone.icon}`} style={{ fontSize: '1.2rem', color: tone.iconColor }} />
                          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{item.title}</h3>
                        </div>
                        <button
                          type="button"
                          aria-label="Clear notification"
                          onClick={() => dismissNotification(item.id)}
                          style={{
                            border: '1px solid rgba(255,255,255,0.18)',
                            background: 'rgba(255,255,255,0.06)',
                            color: '#fff',
                            borderRadius: '999px',
                            width: '24px',
                            height: '24px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <i className="bx bx-x" style={{ fontSize: '1rem' }} />
                        </button>
                      </div>
                      <p style={{ margin: 0, color: 'rgba(255,255,255,0.88)', lineHeight: 1.3, fontSize: '0.92rem' }}>{item.detail}</p>
                      {(item.actionLabel || item.href) && (
                        <div style={{ marginTop: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          {item.actionLabel && item.actionType === 'resend_verification' && (
                            <button
                              type="button"
                              onClick={() => handleNotificationAction(item)}
                              disabled={resendVerificationLoading}
                              style={{
                                border: '1px solid rgba(255,255,255,0.25)',
                                background: 'rgba(255,255,255,0.08)',
                                color: '#fff',
                                borderRadius: '999px',
                                padding: '6px 10px',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                cursor: resendVerificationLoading ? 'default' : 'pointer',
                              }}
                            >
                              {resendVerificationLoading ? 'Sending...' : item.actionLabel}
                            </button>
                          )}
                          {item.href && (
                            <Link
                              href={item.href}
                              style={{
                                textDecoration: 'none',
                                border: '1px solid rgba(255,255,255,0.2)',
                                background: 'rgba(255,255,255,0.05)',
                                color: '#fff',
                                borderRadius: '999px',
                                padding: '6px 10px',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                              }}
                            >
                              {item.actionType === 'open_href' && item.actionLabel ? item.actionLabel : 'Open'}
                            </Link>
                          )}
                        </div>
                      )}
                    </article>
                  );
                }

                const item = entry.item;
                return (
                  <article
                    key={`a-${item.id}`}
                    style={{
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.12)',
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
                      padding: '9px',
                      minHeight: '76px',
                      flex: '0 0 min(310px, 84vw)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      scrollSnapAlign: 'start',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className={`bx ${item.icon}`} style={{ fontSize: '1.2rem', color: '#fde68a' }} />
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>{item.title}</h3>
                      </div>
                      <button
                        type="button"
                        aria-label="Clear activity"
                        onClick={() => dismissRecentActivity(item.id)}
                        style={{
                          border: '1px solid rgba(255,255,255,0.18)',
                          background: 'rgba(255,255,255,0.06)',
                          color: '#fff',
                          borderRadius: '999px',
                          width: '24px',
                          height: '24px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <i className="bx bx-x" style={{ fontSize: '1rem' }} />
                      </button>
                    </div>
                    <p style={{ margin: 0, color: 'rgba(255,255,255,0.87)', lineHeight: 1.3, fontSize: '0.92rem' }}>{item.detail}</p>
                    <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                      {item.when ? <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '0.84rem' }}>{item.when}</p> : <span />}
                      <Link
                        href={item.href}
                        style={{
                          textDecoration: 'none',
                          border: '1px solid rgba(255,255,255,0.2)',
                          background: 'rgba(255,255,255,0.05)',
                          color: '#fff',
                          borderRadius: '999px',
                          padding: '6px 11px',
                          fontWeight: 700,
                          fontSize: '0.9rem',
                        }}
                      >
                        Open
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
            <style jsx>{`
              .updates-rail::-webkit-scrollbar {
                display: none;
                width: 0;
                height: 0;
              }
            `}</style>
            {!updatesLoading && mergedUpdates.length === 0 && (
              <p style={{ marginTop: '10px', color: 'rgba(255,255,255,0.75)' }}>
                No updates right now.
              </p>
            )}
            {notificationNotice && hasPaidPlan && (
              <p style={{ marginTop: '10px', color: '#cde8ff', fontSize: '0.92rem' }}>{notificationNotice}</p>
            )}
          </section>

          {/* Features Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '16px' }}>
            {visibleFeatures.map((feature, idx) => (
              <Link
                key={idx}
                href={feature.href}
                prefetch={feature.href === '/settings' ? false : undefined}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  background: `linear-gradient(135deg, ${feature.color})`,
                  padding: '24px 20px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  height: '100%'
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
                    <i className={`bx ${feature.icon}`} style={{ fontSize: '2.2rem', display: 'block', marginBottom: '12px', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }}></i>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '6px' }}>{feature.title}</h3>
                    <p style={{ fontSize: '0.92rem', opacity: 0.9, marginBottom: '8px' }}>{feature.desc}</p>
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
