"use client";
import { useEffect, useState, useTransition } from 'react';
import styles from './settingsPage.module.css';

type UserPlan = {
  plan?: string;
  planStatus?: string;
  planPrice?: string | number;
  nextBillingDate?: any;
  hasStripeCustomer?: boolean;
  paidAccess?: boolean;
  cancelAtPeriodEnd?: boolean;
  canResume?: boolean;
  archiveAt?: string | null;
  deleteAt?: string | null;
  scheduledPlan?: string | null;
  scheduledChangeDate?: string | null;
};

type PaymentMethodSummary = {
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  name?: string | null;
  country?: string | null;
};

export default function BillingSection({ initialPlanData = null }: { initialPlanData?: UserPlan | null }) {
  const [planData, setPlanData] = useState<UserPlan | null>(initialPlanData);
  const [loading, setLoading] = useState(!initialPlanData);
  const [error, setError] = useState<string | null>(null);
  const [portalPending, startPortal] = useTransition();
  const [portalError, setPortalError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodSummary | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [checkoutSynced, setCheckoutSynced] = useState(false);
  const [billingBackfillChecked, setBillingBackfillChecked] = useState(false);

  const hasNoPaidPlan = !planData?.paidAccess;
  const normalizedStatus = (planData?.planStatus || '').toString().toLowerCase();
  const isLapsedStatus = normalizedStatus === 'expired' || normalizedStatus === 'cancelled';
  const isPastDueStatus = normalizedStatus === 'past_due';
  const isCancellationScheduled = Boolean(planData?.paidAccess && planData?.cancelAtPeriodEnd);
  const hasScheduledPlanChange = Boolean(planData?.scheduledPlan && planData?.scheduledChangeDate);

  useEffect(() => {
    const shouldShowLoader = !initialPlanData;
    if (shouldShowLoader) {
      setLoading(true);
    }
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
        if (shouldShowLoader) {
          setLoading(false);
        }
      });
  // First paint uses server data when available; then this refreshes in background.
  }, [initialPlanData]);

  useEffect(() => {
    if (checkoutSynced) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout') || params.get('checkout_status');
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
          cleanUrl.searchParams.delete('checkout_status');
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
  }, [checkoutSynced]);

  useEffect(() => {
    if (billingBackfillChecked || loading) {
      return;
    }

    const planLabel = (planData?.plan || '').toString().toLowerCase();
    const looksUnsubscribed =
      !planLabel || planLabel.includes('free') || planLabel.includes('no plan') || planLabel.includes('inactive');
    if (!looksUnsubscribed) {
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
  }, [billingBackfillChecked, loading, planData?.plan]);

  useEffect(() => {
    if (!planData?.hasStripeCustomer) {
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
  }, [planData?.hasStripeCustomer]);

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

  const openCustomerPortal = (mode: 'manage' | 'payment_method_update' = 'manage') => {
    setPortalError(null);
    startPortal(async () => {
      try {
        const res = await fetch('/api/stripe/customer-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
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
                  {isLapsedStatus
                    ? `Subscription ended: ${formatNextBillingDate(planData?.nextBillingDate)}`
                    : isCancellationScheduled
                      ? `Access until: ${formatNextBillingDate(planData?.nextBillingDate)}`
                      : `Next billing: ${formatNextBillingDate(planData?.nextBillingDate)}`}
                </p>
                {isCancellationScheduled && !isLapsedStatus && (
                  <p className={styles.planHint} style={{ color: '#fef3c7' }}>
                    Cancellation scheduled. Future billing is stopped and paid access remains until the end date above.
                  </p>
                )}
                {hasScheduledPlanChange && !isLapsedStatus && (
                  <p className={styles.planHint} style={{ color: '#fef3c7' }}>
                    Scheduled change: {planData?.plan} remains active until {formatNextBillingDate(planData?.scheduledChangeDate)}, then switches to {planData?.scheduledPlan}.
                  </p>
                )}
                {isPastDueStatus && (
                  <p className={styles.billingAlert}>
                    We weren't able to collect the payment, so your service may stop soon unless it's fixed. Reactivate to continue.
                  </p>
                )}
                {isLapsedStatus && (
                  <>
                    <p className={styles.billingAlert}>
                      Your subscription has ended. Reactivate to continue.
                    </p>
                    <p className={styles.planHint} style={{ color: '#fca5a5' }}>
                      Account retained. Archive date: {formatNextBillingDate(planData?.archiveAt)} · Deletion date:{' '}
                      {formatNextBillingDate(planData?.deleteAt)}
                    </p>
                  </>
                )}
                {!isLapsedStatus && (
                  <p className={styles.planHint}>
                    Your account and data remain in place if subscription access ends, subject to your retention schedule.
                  </p>
                )}
              </div>
            </div>
            <div className={styles.planCardActions}>
              <div className={styles.planButtons}>
                <a href="/pricing?redirect=%2Fsettings%3Ftab%3Dbilling" className={styles.primaryBtn} style={{ textDecoration: 'none' }}>Change Plan</a>
                {planData?.hasStripeCustomer && (
                  <button
                    type="button"
                    disabled={portalPending}
                    onClick={() => {
                      openCustomerPortal('manage');
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
        {hasNoPaidPlan && !planData?.hasStripeCustomer ? (
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
        {!loading && (
          <div className={styles.bottomActions}>
            {planData?.hasStripeCustomer ? (
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={portalPending}
                onClick={() => openCustomerPortal(hasNoPaidPlan ? 'manage' : 'payment_method_update')}
              >
                {portalPending
                  ? 'Opening…'
                  : hasNoPaidPlan
                    ? 'Resume in billing portal'
                    : paymentMethod
                      ? 'Update payment method'
                      : 'Add payment method'}
              </button>
            ) : (
              <a href="/pricing?redirect=%2Fsettings%3Ftab%3Dbilling" className={styles.primaryBtn} style={{ textDecoration: 'none' }}>
                {isLapsedStatus ? 'Resume plan' : 'Choose a plan'}
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
