'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { isTrialingStripeStatus } from '@/lib/payments/subscription-status';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';
import { getPublicRouteForMarket, normalizePublicMarket } from '@/lib/markets/public-routes';

type SyncState = 'syncing' | 'failed';

export default function CheckoutSuccessPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<SyncState>('syncing');
  const [message, setMessage] = useState('Finalizing your subscription...');

  const sessionId = useMemo(
    () => (searchParams?.get('session_id') || '').trim(),
    [searchParams]
  );
  const publicMarket = useMemo(
    () => normalizePublicMarket(searchParams?.get('market')),
    [searchParams]
  );
  const pricingHref = useMemo(
    () => getPublicRouteForMarket('/pricing', publicMarket),
    [publicMarket]
  );
  const dashboardHref = useMemo(
    () => getAppRouteForMarket('/dashboard', publicMarket),
    [publicMarket]
  );
  const billingSettingsHref = useMemo(
    () => getAppRouteForMarket('/settings?tab=billing', publicMarket),
    [publicMarket]
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        if (!sessionId) {
          router.replace(dashboardHref);
          return;
        }

        const res = await fetch('/api/stripe/checkout-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ sessionId }),
        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(payload?.error || 'Could not confirm payment status.');
        }

        if (cancelled) return;
        setMessage(
          isTrialingStripeStatus(payload?.status)
            ? 'Free trial confirmed. Redirecting...'
            : 'Payment confirmed. Redirecting...'
        );
        router.replace(dashboardHref);
      } catch (error: any) {
        if (cancelled) return;
        setState('failed');
        setMessage(error?.message || 'Could not finalize your subscription. Please try again.');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [dashboardHref, router, sessionId]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at 18% 14%, rgba(147, 51, 234, 0.2), transparent 48%), radial-gradient(circle at 86% 10%, rgba(236, 72, 153, 0.14), transparent 44%), linear-gradient(180deg, #270427 0%, #1d0326 48%, #13021a 100%)',
        color: '#f8fafc',
        padding: '1.5rem',
      }}
    >
      <section
        style={{
          width: 'min(560px, 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(248, 250, 252, 0.15)',
          background: 'linear-gradient(160deg, rgba(17, 24, 39, 0.88), rgba(30, 41, 59, 0.78))',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)',
          padding: '2rem',
        }}
      >
        <p style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.75rem', color: '#f8a76f', margin: 0 }}>
          Checkout
        </p>
        <h1 style={{ fontSize: '2rem', lineHeight: 1.1, margin: '0.6rem 0 0.8rem 0' }}>Finishing setup</h1>
        <p style={{ margin: 0, color: '#cbd5f5' }}>{message}</p>

        {state === 'failed' && (
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <a
              href={pricingHref}
              style={{
                textDecoration: 'none',
                padding: '0.7rem 1rem',
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.22)',
                color: '#fff',
                fontWeight: 600,
              }}
            >
              Return to pricing
            </a>
            <a
              href={billingSettingsHref}
              style={{
                textDecoration: 'none',
                padding: '0.7rem 1rem',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)',
                color: '#052a27',
                fontWeight: 700,
              }}
            >
              Open billing settings
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
