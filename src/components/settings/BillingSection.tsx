"use client";
import React, { useEffect, useState, useTransition } from 'react';
import styles from './settingsPage.module.css';
import { supabase } from '@/lib/database/supabase-client'

type UserPlan = {
  plan?: string;
  planStatus?: string;
  planPrice?: string | number;
  nextBillingDate?: any;
  hasStripeCustomer?: boolean;
};

type PaymentMethodSummary = {
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  name?: string | null;
  country?: string | null;
};

export default function BillingSection() {
  const [uid, setUid] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [planData, setPlanData] = useState<UserPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalPending, startPortal] = useTransition();
  const [portalError, setPortalError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodSummary | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [checkoutSynced, setCheckoutSynced] = useState(false);
  const [billingBackfillChecked, setBillingBackfillChecked] = useState(false);

  const normalizedPlan = (planData?.plan || '').toString().toLowerCase();
  const hasNoPaidPlan = normalizedPlan.includes('free');

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (user && mounted) {
        setUid(user.id)
        setIdToken(data.session?.access_token ?? null)
      } else if (mounted) {
        setUid(null)
        setIdToken(null)
      }
      if (mounted) setAuthResolved(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      setUid(user?.id ?? null)
      setIdToken(session?.access_token ?? null)
      setAuthResolved(true)
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, []);

  useEffect(() => {
    if (!authResolved) {
      return;
    }

    if (!uid) {
      setLoading(false);
      setPlanData(null);
      return;
    }
    setLoading(true);
    setError(null);
    
    // Fetch plan from server-side API
    fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch plan');
        return res.json();
      })
      .then(data => {
        setPlanData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [uid, authResolved]);

  useEffect(() => {
    if (!authResolved || !uid || checkoutSynced) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const sessionId = params.get('session_id');
    if (checkout !== 'success' || !sessionId) {
      return;
    }

    let cancelled = false;

    const syncCheckout = async () => {
      let syncSucceeded = false;
      try {
        const syncRes = await fetch('/api/stripe/checkout-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ sessionId }),
        });
        syncSucceeded = syncRes.ok;

        if (!cancelled) {
          const res = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            setPlanData(data);
          }
        }
      } catch (syncError) {
        console.error('Failed to sync checkout session:', syncError);
      } finally {
        if (!cancelled) {
          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('checkout');
          cleanUrl.searchParams.delete('session_id');
          window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
          setCheckoutSynced(true);
          if (syncSucceeded) {
            window.location.replace('/dashboard');
          }
        }
      }
    };

    void syncCheckout();

    return () => {
      cancelled = true;
    };
  }, [uid, authResolved, checkoutSynced]);

  useEffect(() => {
    if (!authResolved || !uid || billingBackfillChecked || loading) {
      return;
    }

    const planLabel = (planData?.plan || '').toString().toLowerCase();
    const looksFree = !planLabel || planLabel.includes('free');
    if (!looksFree) {
      setBillingBackfillChecked(true);
      return;
    }

    let cancelled = false;

    const runBackfillSync = async () => {
      try {
        await fetch('/api/stripe/checkout-sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({}),
        });

        if (!cancelled) {
          const res = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
          if (res.ok) {
            const data = await res.json();
            setPlanData(data);
          }
        }
      } catch (backfillError) {
        console.error('Failed to run billing backfill sync:', backfillError);
      } finally {
        if (!cancelled) {
          setBillingBackfillChecked(true);
        }
      }
    };

    void runBackfillSync();

    return () => {
      cancelled = true;
    };
  }, [uid, authResolved, billingBackfillChecked, loading, planData?.plan]);

  useEffect(() => {
    if (!authResolved || !uid || hasNoPaidPlan || !planData?.hasStripeCustomer) {
      setPaymentMethod(null);
      setPaymentLoading(false);
      setPaymentError(null);
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);

    fetch('/api/stripe/payment-method', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || 'Failed to load payment method');
        }
        return res.json();
      })
      .then((data) => {
        setPaymentMethod(data?.paymentMethod || null);
        setPaymentLoading(false);
      })
      .catch((err) => {
        setPaymentError(err.message);
        setPaymentLoading(false);
      });
  }, [uid, authResolved, hasNoPaidPlan, planData?.hasStripeCustomer]);

  function formatNextBillingDate(value: any): string {
    if (!value) return '—';
    try {
      if (value?.toDate) {
        return value.toDate().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      }
    } catch (_) {}
    return String(value);
  }

  const openCustomerPortal = () => {
    setPortalError(null);
    startPortal(async () => {
      try {
        const res = await fetch('/api/stripe/customer-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid }),
        });
        const json = await res.json();
        if (!res.ok || !json.url) {
          const rawError = String(json?.error || '').toLowerCase();
          if (rawError.includes('no stripe customer id')) {
            throw new Error('Billing management becomes available after you start a paid plan.');
          }
          throw new Error('We could not open billing management right now. Please try again.');
        }
        window.location.href = json.url;
      } catch (e: any) {
        setPortalError(e?.message || 'We could not open billing management right now. Please try again.');
      }
    });
  };

  return (
    <div className={styles.sectionWrapper}>
      <section className={styles.settingsSection}>
        <h2 className={styles.sectionHeading}>Current Plan</h2>
        {loading ? (
          <div style={{ padding: '12px 0', fontSize: '0.9rem', color: '#6b7280' }}>Loading plan...</div>
        ) : error ? (
          <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>Error loading plan: {error}</div>
        ) : (
          <div className={styles.planCard}>
            <div className={styles.planCardTop}>
              <div>
                <span className={styles.planStatusBadge}>
                  {(planData?.planStatus || 'Active').slice(0, 1).toUpperCase() + (planData?.planStatus || 'Active').slice(1)}
                </span>
                <h3 className={styles.planTitle}>{planData?.plan || 'No active plan'}</h3>
                {planData?.planPrice && planData?.planPrice !== '0' && planData?.planPrice !== 0 && (
                  <p className={styles.planPriceLarge}>£{planData?.planPrice}/month</p>
                )}
                <p className={styles.planHint}>
                  Next billing: {formatNextBillingDate(planData?.nextBillingDate)}
                </p>
              </div>
            </div>
            <div className={styles.planCardActions}>
              <div className={styles.planButtons}>
                <a href="/pricing" className={styles.primaryBtn} style={{ textDecoration: 'none' }}>Change Plan</a>
                {uid && planData?.hasStripeCustomer && (
                  <button
                    type="button"
                    disabled={portalPending}
                    onClick={() => {
                      openCustomerPortal();
                    }}
                    className={styles.primaryBtn}
                    style={{ background: '#4c1d95' }}
                  >
                    {portalPending ? 'Opening...' : 'Manage Billing'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {portalError && (
          <p className={styles.helpText} style={{ marginTop: 8, color: '#dc2626' }}>Portal error: {portalError}</p>
        )}
      </section>

      <section className={styles.settingsSection}>
        <h2 className={styles.sectionHeading}>Payment Methods</h2>
        {hasNoPaidPlan ? (
          <div className={styles.paymentCard}>
            <div className={styles.cardInfo}>
              <div>
                <h4>Available on paid plans</h4>
                <p className={styles.helpText}>Your payment method details will appear here after you start a paid subscription.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className={styles.paymentCard}>
            <div className={styles.cardInfo}>
              <div>
                {paymentLoading ? (
                  <>
                    <h4>Loading payment method…</h4>
                    <p className={styles.helpText}>Please wait while we fetch your billing details.</p>
                  </>
                ) : !authResolved ? (
                  <>
                    <h4>Loading account session…</h4>
                    <p className={styles.helpText}>Please wait.</p>
                  </>
                ) : !uid ? (
                  <>
                    <h4>Unavailable</h4>
                    <p className={styles.helpText}>Account session unavailable. Refresh and try again.</p>
                  </>
                ) : paymentMethod ? (
                  <>
                    <h4>Card ending •••• {paymentMethod.last4}</h4>
                    <p className={styles.helpText}>
                      {paymentMethod.brand ? `${paymentMethod.brand.toUpperCase()} ` : ''}exp {paymentMethod.exp_month}/{paymentMethod.exp_year}
                      {paymentMethod.name ? ` · ${paymentMethod.name}` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <h4>No payment method on file</h4>
                    <p className={styles.helpText}>Add a payment method to manage your paid subscription.</p>
                  </>
                )}
                {paymentError && (
                  <p className={styles.helpText} style={{ color: '#dc2626' }}>{paymentError}</p>
                )}
              </div>
            </div>
          </div>
        )}
        {uid && !hasNoPaidPlan && (
          <div className={styles.bottomActions}>
            {planData?.hasStripeCustomer ? (
              <button type="button" className={styles.primaryBtn} disabled={portalPending} onClick={openCustomerPortal}>
                {portalPending ? 'Opening…' : paymentMethod ? 'Update payment method' : 'Add payment method'}
              </button>
            ) : (
              <a href="/pricing" className={styles.primaryBtn} style={{ textDecoration: 'none' }}>
                Choose a plan
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
