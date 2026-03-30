"use client";
import { useEffect, useState, useTransition } from 'react';
import styles from './settingsPage.module.css';
import { isTrialingStripeStatus } from '@/lib/payments/subscription-status';
import InAppPaymentMethodModal from './InAppPaymentMethodModal';

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
  const [billingActionPending, setBillingActionPending] = useState<'cancel' | 'resume' | null>(null);
  const [billingActionError, setBillingActionError] = useState<string | null>(null);
  const [billingActionMessage, setBillingActionMessage] = useState<string | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodSummary | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [checkoutSynced, setCheckoutSynced] = useState(false);
  const [billingBackfillChecked, setBillingBackfillChecked] = useState(false);

  const hasNoPaidPlan = !planData?.paidAccess;
  const normalizedStatus = (planData?.planStatus || '').toString().toLowerCase();
  const isLapsedStatus = normalizedStatus === 'expired' || normalizedStatus === 'cancelled';
  const isPastDueStatus = normalizedStatus === 'past_due';
  const isTrialingStatus = isTrialingStripeStatus(normalizedStatus);
  const isCancellationScheduled = Boolean(planData?.paidAccess && planData?.cancelAtPeriodEnd);
  const hasScheduledPlanChange = Boolean(planData?.scheduledPlan && planData?.scheduledChangeDate);
  const canCancelInApp = Boolean(planData?.paidAccess && !isLapsedStatus && !isCancellationScheduled);
  const canResumeInApp = Boolean(planData?.paidAccess && isCancellationScheduled);

  const refreshPlanData = async () => {
    const res = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) {
      throw new Error('Failed to refresh billing state');
    }
    const data = await res.json();
    setPlanData(data);
    return data;
  };

  const refreshPaymentMethod = async () => {
    if (!planData?.hasStripeCustomer) {
      setPaymentMethod(null);
      setPaymentLoading(false);
      setPaymentError(null);
      return null;
    }

    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await fetch('/api/stripe/payment-method', { credentials: 'include', cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load payment method');
      }
      const nextPaymentMethod = data?.paymentMethod || null;
      setPaymentMethod(nextPaymentMethod);
      return nextPaymentMethod;
    } catch (err: any) {
      setPaymentError(err.message || 'Failed to load payment method');
      return null;
    } finally {
      setPaymentLoading(false);
    }
  };

  useEffect(() => {
    const shouldShowLoader = !initialPlanData;
    if (shouldShowLoader) {
      setLoading(true);
    }
    setError(null);
    setBillingActionError(null);
    
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
    void refreshPaymentMethod();
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
    setBillingActionError(null);
    const portalTab = typeof window !== 'undefined' ? window.open('', '_blank') : null;

    if (portalTab) {
      try {
        portalTab.opener = null;
        portalTab.document.title = 'Opening billing...';
        portalTab.document.body.innerHTML =
          '<p style="font-family:system-ui,-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;padding:24px;color:#111827;">Opening billing...</p>';
      } catch (_) {
        // Ignore placeholder rendering failures and continue with the portal launch.
      }
    }

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
        if (portalTab && !portalTab.closed) {
          portalTab.location.href = json.url;
          portalTab.focus?.();
          return;
        }
        window.location.href = json.url;
      } catch (e: any) {
        if (portalTab && !portalTab.closed) {
          portalTab.close();
        }
        setPortalError(e?.message || 'We could not open billing management right now. Please try again.');
      }
    });
  };

  const handlePaymentMethodUpdated = async (nextPaymentMethod: PaymentMethodSummary | null) => {
    setPaymentMethod(nextPaymentMethod);
    setPaymentError(null);
    setPortalError(null);
    setBillingActionError(null);
    setBillingActionMessage('Payment method updated. Future renewals will use the new card.');
    setPaymentModalOpen(false);
    await refreshPlanData().catch(() => null);
    if (!nextPaymentMethod) {
      await refreshPaymentMethod();
    }
  };

  const handleCancelSubscription = async () => {
    setBillingActionPending('cancel');
    setBillingActionError(null);
    setBillingActionMessage(null);
    try {
      const res = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to cancel subscription');
      }
      await refreshPlanData();
      setBillingActionMessage(
        isTrialingStatus
          ? 'Trial cancellation scheduled. Your trial remains active until the end date shown, and billing will not start.'
          : 'Cancellation scheduled. Your paid access remains active until the end date shown.'
      );
      setCancelConfirmOpen(false);
    } catch (err: any) {
      setBillingActionError(err?.message || 'Unable to cancel subscription');
    } finally {
      setBillingActionPending(null);
    }
  };

  const handleResumeSubscription = async () => {
    setBillingActionPending('resume');
    setBillingActionError(null);
    setBillingActionMessage(null);
    try {
      const res = await fetch('/api/stripe/resume-subscription', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || 'Unable to resume subscription');
      }
      await refreshPlanData();
      setBillingActionMessage(
        isTrialingStatus
          ? 'Your free trial will continue and billing will start on the first charge date shown unless you cancel again.'
          : 'Scheduled cancellation removed. Your subscription will continue renewing normally.'
      );
    } catch (err: any) {
      setBillingActionError(err?.message || 'Unable to resume subscription');
    } finally {
      setBillingActionPending(null);
    }
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
                    : isTrialingStatus && isCancellationScheduled
                      ? `Trial ends: ${formatNextBillingDate(planData?.nextBillingDate)}`
                      : isTrialingStatus
                        ? `First charge: ${formatNextBillingDate(planData?.nextBillingDate)}`
                    : isCancellationScheduled
                      ? `Access until: ${formatNextBillingDate(planData?.nextBillingDate)}`
                      : `Next billing: ${formatNextBillingDate(planData?.nextBillingDate)}`}
                </p>
                {isTrialingStatus && !isLapsedStatus && (
                  <p className={styles.planHint} style={{ color: '#bfdbfe' }}>
                    {isCancellationScheduled
                      ? 'Your free trial is set to end on the date above. You will not be charged unless you resume before then.'
                      : 'Your free trial is active. You will be charged on the date above unless you cancel beforehand.'}
                  </p>
                )}
                {isCancellationScheduled && !isLapsedStatus && (
                  <p className={styles.planHint} style={{ color: '#fef3c7' }}>
                    {isTrialingStatus
                      ? 'Cancellation scheduled. Trial access remains until the end date above, and billing will not start.'
                      : 'Cancellation scheduled. Future billing is stopped and paid access remains until the end date above.'}
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
                {canResumeInApp && (
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    disabled={billingActionPending === 'resume'}
                    onClick={() => {
                      void handleResumeSubscription();
                    }}
                  >
                    {billingActionPending === 'resume'
                      ? 'Resuming...'
                      : isTrialingStatus
                        ? 'Continue trial'
                        : 'Resume renewal'}
                  </button>
                )}
                {canCancelInApp && (
                  <button
                    type="button"
                    className={styles.dangerOutlineBtn}
                    disabled={billingActionPending === 'cancel'}
                    onClick={() => {
                      setBillingActionError(null);
                      setBillingActionMessage(null);
                      setCancelConfirmOpen(true);
                    }}
                  >
                    {isTrialingStatus ? 'Cancel trial' : 'Cancel subscription'}
                  </button>
                )}
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
        {billingActionMessage && (
          <p className={styles.helpText} style={{ marginTop: 8, color: '#bfdbfe' }}>{billingActionMessage}</p>
        )}
        {billingActionError && (
          <p className={styles.helpText} style={{ marginTop: 8, color: '#dc2626' }}>Billing action error: {billingActionError}</p>
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
                onClick={() => {
                  if (hasNoPaidPlan) {
                    openCustomerPortal('manage');
                    return;
                  }
                  setBillingActionMessage(null);
                  setBillingActionError(null);
                  setPortalError(null);
                  setPaymentModalOpen(true);
                }}
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

      {cancelConfirmOpen && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="billing-cancel-title">
          <div className={styles.modalCard}>
            <h3 id="billing-cancel-title" className={styles.modalTitle}>
              {isTrialingStatus ? 'Cancel free trial?' : 'Cancel subscription?'}
            </h3>
            <p className={styles.modalBody}>
              {isTrialingStatus
                ? 'Your free trial will remain active until the date shown on this page. After that, billing will not start unless you resume before the trial ends.'
                : 'Your subscription will remain active until the date shown on this page. After that, renewal billing will stop unless you resume before the end date.'}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={billingActionPending === 'cancel'}
                onClick={() => setCancelConfirmOpen(false)}
              >
                Keep plan
              </button>
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={billingActionPending === 'cancel'}
                onClick={() => {
                  void handleCancelSubscription();
                }}
              >
                {billingActionPending === 'cancel'
                  ? 'Cancelling...'
                  : isTrialingStatus
                    ? 'Cancel trial'
                    : 'Cancel subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
      <InAppPaymentMethodModal
        open={paymentModalOpen}
        hasExistingPaymentMethod={Boolean(paymentMethod)}
        onClose={() => {
          setPaymentModalOpen(false);
        }}
        onSuccess={handlePaymentMethodUpdated}
        onOpenPortalFallback={() => {
          setPaymentModalOpen(false);
          openCustomerPortal('payment_method_update');
        }}
        portalPending={portalPending}
      />
    </div>
  );
}
