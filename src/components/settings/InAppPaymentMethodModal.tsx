'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import styles from './settingsPage.module.css';

type PaymentMethodSummary = {
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  name?: string | null;
  country?: string | null;
};

type InAppPaymentMethodModalProps = {
  open: boolean;
  hasExistingPaymentMethod: boolean;
  isTrialing?: boolean;
  onClose: () => void;
  onSuccess: (paymentMethod: PaymentMethodSummary | null) => Promise<void> | void;
  onOpenPortalFallback: () => void;
  portalPending?: boolean;
};

const stripePublishableKey = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '').trim();
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null;

function PaymentMethodSetupForm({
  clientSecret,
  hasExistingPaymentMethod,
  isTrialing = false,
  onClose,
  onSuccess,
  onOpenPortalFallback,
  portalPending = false,
}: {
  clientSecret: string;
  hasExistingPaymentMethod: boolean;
  isTrialing?: boolean;
  onClose: () => void;
  onSuccess: (paymentMethod: PaymentMethodSummary | null) => Promise<void> | void;
  onOpenPortalFallback: () => void;
  portalPending?: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements) {
      setSubmitError('Stripe has not finished loading yet. Please try again.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const submitResult = await elements.submit();
      if (submitResult.error) {
        throw new Error(submitResult.error.message || 'Please review your card details and try again.');
      }

      const confirmResult = await stripe.confirmSetup({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/settings?tab=billing`,
        },
        redirect: 'if_required',
      });

      if (confirmResult.error) {
        throw new Error(confirmResult.error.message || 'Payment method confirmation failed.');
      }

      const setupIntentId = confirmResult.setupIntent?.id;
      if (!setupIntentId) {
        throw new Error('Stripe did not return a setup intent for this payment method update.');
      }

      const response = await fetch('/api/stripe/payment-method', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ setupIntentId }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || 'We could not save your payment method.');
      }

      await onSuccess(payload?.paymentMethod || null);
    } catch (error: any) {
      setSubmitError(error?.message || 'We could not update your payment method.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.paymentModalForm}>
      <div className={styles.paymentModalSection}>
        <p className={styles.modalBody} style={{ marginBottom: 12 }}>
          {isTrialing
            ? hasExistingPaymentMethod
              ? 'Enter the card you want us to use if you continue after your free trial ends.'
              : 'Add your billing information now so your access can continue after the free trial ends.'
            : hasExistingPaymentMethod
              ? 'Enter the new card you want future renewals to use.'
              : 'Add a card so your paid subscription can renew automatically.'}
        </p>
        <div className={styles.paymentElementWrap}>
          <PaymentElement
            options={{
              layout: 'tabs',
              business: { name: 'MyMcKenzieCS' },
            }}
          />
        </div>
        <p className={styles.helpText}>
          Your card details stay with Stripe. The app only stores the summary needed for billing.
        </p>
        {submitError && <p className={styles.paymentModalError}>{submitError}</p>}
      </div>
      <div className={styles.modalActions}>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onOpenPortalFallback}
          disabled={submitting || portalPending}
        >
          {portalPending ? 'Opening Stripe…' : 'Open Stripe billing'}
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.primaryBtn}
          disabled={!stripe || !elements || submitting}
        >
          {submitting
            ? 'Saving…'
            : isTrialing
              ? hasExistingPaymentMethod
                ? 'Save billing info'
                : 'Add billing info'
              : hasExistingPaymentMethod
                ? 'Save new card'
                : 'Add card'}
        </button>
      </div>
    </form>
  );
}

export default function InAppPaymentMethodModal({
  open,
  hasExistingPaymentMethod,
  isTrialing = false,
  onClose,
  onSuccess,
  onOpenPortalFallback,
  portalPending = false,
}: InAppPaymentMethodModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);
  const [intentError, setIntentError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setLoadingIntent(false);
      setIntentError(null);
      return;
    }

    if (!stripePublishableKey || !stripePromise) {
      setIntentError('In-app card updates are unavailable because Stripe client configuration is missing.');
      return;
    }

    let cancelled = false;
    setLoadingIntent(true);
    setIntentError(null);

    const createSetupIntent = async () => {
      try {
        const response = await fetch('/api/stripe/payment-method', {
          method: 'POST',
          credentials: 'include',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.clientSecret) {
          throw new Error(payload?.error || 'We could not initialize card updates right now.');
        }

        if (!cancelled) {
          setClientSecret(String(payload.clientSecret));
        }
      } catch (error: any) {
        if (!cancelled) {
          setIntentError(error?.message || 'We could not initialize card updates right now.');
        }
      } finally {
        if (!cancelled) {
          setLoadingIntent(false);
        }
      }
    };

    void createSetupIntent();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const elementsOptions = useMemo(() => {
    if (!clientSecret) return null;

    return {
      clientSecret,
      appearance: {
        theme: 'night' as const,
        variables: {
          colorPrimary: '#7c3aed',
          colorBackground: '#0f172a',
          colorText: '#f8fafc',
          colorDanger: '#ef4444',
          colorTextSecondary: '#cbd5e1',
          borderRadius: '12px',
        },
      },
    };
  }, [clientSecret]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="billing-payment-method-title">
      <div className={styles.modalCard}>
        <h3 id="billing-payment-method-title" className={styles.modalTitle}>
          {isTrialing
            ? (hasExistingPaymentMethod ? 'Update billing information' : 'Add billing information')
            : (hasExistingPaymentMethod ? 'Update payment method' : 'Add payment method')}
        </h3>
        {loadingIntent && (
          <p className={styles.modalBody}>Preparing the secure card form…</p>
        )}
        {!loadingIntent && intentError && (
          <>
            <p className={styles.modalBody}>{intentError}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={onOpenPortalFallback}
                disabled={portalPending}
              >
                {portalPending ? 'Opening Stripe…' : 'Open Stripe billing'}
              </button>
            </div>
          </>
        )}
        {!loadingIntent && !intentError && clientSecret && stripePromise && elementsOptions && (
          <Elements stripe={stripePromise} options={elementsOptions}>
            <PaymentMethodSetupForm
              clientSecret={clientSecret}
              hasExistingPaymentMethod={hasExistingPaymentMethod}
              isTrialing={isTrialing}
              onClose={onClose}
              onSuccess={onSuccess}
              onOpenPortalFallback={onOpenPortalFallback}
              portalPending={portalPending}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
