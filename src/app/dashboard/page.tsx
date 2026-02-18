"use client";
import { useEffect, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser';
import Link from 'next/link';
import { isPaidPlan } from '@/lib/plans/access';

export default function DashboardPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [plan, setPlan] = useState<string>('free');
  const [planLoaded, setPlanLoaded] = useState(false);

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

  const hasPlanAccess = isPaidPlan(plan);
  const features: Array<{
    icon: string;
    title: string;
    desc: string;
    href: string;
    color: string;
    badge?: string;
  }> = [
    {
      icon: 'bx-edit',
      title: 'Store My Document',
      desc: 'Upload your legal document',
      href: '/dashboard/documents',
      color: '#2563eb,#60a5fa'
    },
    {
      icon: 'bx-folder-open',
      title: 'Review My Notes',
      desc: 'Access active and closed matters',
      href: '/dashboard/MyNotes',
      color: '#db2777,#f472b6'
    },
    {
      icon: 'bx-briefcase',
      title: 'Check My Calendar',
      desc: 'Track dates and deadlines',
      href: '/dashboard/calendar',
      color: '#ea580c,#fb923c'
    },
    {
      icon: 'bx-search',
      title: 'Search Case Law',
      desc: 'Find relevant case law for your matter',
      href: '/dashboard/case-law-search',
      color: '#f59e42,#fbbf24'
    },
    {
      icon: 'bx-message-dots',
      title: 'Talk to MyMcKenzie Assistant',
      desc: 'Get AI-powered legal guidance',
      href: '/chatbot',
      color: '#10b981,#34d399'
    },
    {
      icon: 'bx-cog',
      title: 'User Settings',
      desc: 'Manage profile, billing, and alerts',
      href: '/settings',
      color: '#7c3aed,#22d3ee'
    }
  ];

  const visibleFeatures = features.filter((feature) => {
    if (feature.href === '/dashboard/case-law-search') {
      return planLoaded && hasPlanAccess;
    }
    return true;
  });

  if (!planLoaded) {
    return (
      <div style={{ background: 'linear-gradient(135deg, #240724 0%, #240724 50%, #240724 100%)', minHeight: '100vh' }}>
        <main style={{ minHeight: '100vh', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', opacity: 0.85 }}>
            <div style={{ marginBottom: 10 }}>Loading your workspace...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ background: 'linear-gradient(135deg, #240724 0%, #240724 50%, #240724 100%)', minHeight: '100vh' }}>
      <main style={{ minHeight: '100vh', color: '#ffffff' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '40px 20px' }}>
          {/* Welcome Section */}
          <div style={{ marginBottom: '60px' }}>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '12px', lineHeight: 1.2 }}>
              Welcome to MymckenzieCS
            </h1>
            <p style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.7)', maxWidth: '600px', lineHeight: 1.6 }}>
              Access your tools and manage your legal matters with AI-powered assistance.
            </p>
          </div>

          {/* Features Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '60px' }}>
            {visibleFeatures.map((feature, idx) => (
              <Link key={idx} href={feature.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  background: `linear-gradient(135deg, ${feature.color})`,
                  padding: '32px 24px',
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
                    <i className={`bx ${feature.icon}`} style={{ fontSize: '2.5rem', display: 'block', marginBottom: '16px', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.2))' }}></i>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 600, marginBottom: '8px' }}>{feature.title}</h3>
                    <p style={{ fontSize: '0.95rem', opacity: 0.9, marginBottom: '12px' }}>{feature.desc}</p>
                  </div>
                  {feature.badge && (
                    <span style={{ fontSize: '0.85rem', background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '20px', width: 'fit-content' }}>
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
