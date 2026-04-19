import { NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import {
  billingIpRateLimiter,
  billingRateLimiter,
  getClientIp,
  getIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from '@/lib/utils/rate-limit';
import { syncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { invalidateUserPlanCache } from '@/lib/payments/user-plan';
import { isBillingActiveStripeStatus, normalizeStripeSubscriptionStatus } from '@/lib/payments/subscription-status';
import { getStripeSubscriptionPeriodEndIso, getStripeSubscriptionPeriodStartIso } from '@/lib/payments/subscription-period';
import { PLAN_PRICES } from '@/constants';
import { planDisplayName } from '@/lib/plans/access';

const RESUMABLE_STATUSES = ['active', 'past_due', 'trialing'] as const;

function resolvePriceIdFromPlan(planType?: string | null) {
  const displayName = planDisplayName(planType || '');
  return PLAN_PRICES.find((plan) => plan.name === displayName)?.priceId || '';
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = authData.user.id;
    const ip = getClientIp(req.headers);

    const userLimit = await rateLimit(
      billingRateLimiter,
      `billing:resume:user:${getIdentifier(authUid, ip)}`,
      10,
      10 * 60 * 1000
    );
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many resume requests. Please try again shortly.');
    }

    if (ip) {
      const ipLimit = await rateLimit(
        billingIpRateLimiter,
        `billing:resume:ip:${ip}`,
        30,
        10 * 60 * 1000
      );
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many resume requests from this network. Please try again shortly.');
      }
    }

    const { data: subscriptionRow } = await supabaseAdmin
      .from('subscriptions')
      .select('id, stripe_subscription_id, stripe_customer_id, status, cancel_at_period_end, plan_type, current_period_end')
      .eq('user_id', authUid)
      .in('status', [...RESUMABLE_STATUSES])
      .eq('cancel_at_period_end', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const stripeSubscriptionId = subscriptionRow?.stripe_subscription_id || null;
    if (!stripeSubscriptionId && String(subscriptionRow?.status || '').toLowerCase() === 'trialing') {
      const nowIso = new Date().toISOString();
      let nextStatus = 'trialing';
      let nextPeriodStart = null;
      let nextPeriodEnd = subscriptionRow?.current_period_end || null;

      const customerId = subscriptionRow?.stripe_customer_id || null;
      const currentPeriodEnd = subscriptionRow?.current_period_end || null;
      const hasFutureTrialEnd =
        Boolean(currentPeriodEnd) && new Date(String(currentPeriodEnd)).getTime() > Date.now() + 60_000;

      if (customerId && hasFutureTrialEnd) {
        try {
          const customer = await stripe.customers.retrieve(customerId, {
            expand: ['invoice_settings.default_payment_method'],
          });
          const defaultPaymentMethodId =
            typeof (customer as any)?.invoice_settings?.default_payment_method === 'string'
              ? (customer as any).invoice_settings.default_payment_method
              : (customer as any)?.invoice_settings?.default_payment_method?.id || null;

          if (defaultPaymentMethodId) {
            const priceId = resolvePriceIdFromPlan(subscriptionRow?.plan_type || '');
            if (priceId) {
              const subscription = await stripe.subscriptions.create({
                customer: customerId,
                items: [{ price: priceId, quantity: 1 }],
                default_payment_method: defaultPaymentMethodId,
                trial_end: Math.floor(new Date(String(currentPeriodEnd)).getTime() / 1000),
                metadata: {
                  userId: authUid,
                  planId: priceId,
                  trialApplied: 'true',
                  origin: 'trial-resume',
                },
              });
              nextStatus = normalizeStripeSubscriptionStatus(subscription.status);
              nextPeriodStart = getStripeSubscriptionPeriodStartIso(subscription);
              nextPeriodEnd = getStripeSubscriptionPeriodEndIso(subscription);

              const { error: trialUpdateError } = await supabaseAdmin
                .from('subscriptions')
                .update({
                  stripe_subscription_id: subscription.id,
                  stripe_customer_id: customerId,
                  status: nextStatus,
                  current_period_start: nextPeriodStart,
                  current_period_end: nextPeriodEnd,
                  cancel_at_period_end: false,
                  updated_at: nowIso,
                })
                .eq('id', subscriptionRow?.id);

              if (trialUpdateError) {
                console.error('Resume subscription: failed to attach Stripe subscription to local trial', trialUpdateError);
                return NextResponse.json({ error: 'Failed to resume trial billing state' }, { status: 500 });
              }
            }
          }
        } catch (creationError: any) {
          console.error('Resume subscription: failed to create Stripe subscription for local trial', creationError);
        }
      }

      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          cancel_at_period_end: false,
          status: nextStatus,
          current_period_start: nextPeriodStart,
          current_period_end: nextPeriodEnd,
          updated_at: nowIso,
        })
        .eq('id', subscriptionRow?.id);

      if (updateError) {
        console.error('Resume subscription: failed to update local trial', updateError);
        return NextResponse.json({ error: 'Failed to update local trial state' }, { status: 500 });
      }

      await syncUserEntitlementSnapshot(authUid);
      invalidateUserPlanCache(authUid);
      return NextResponse.json({
        ok: true,
        status: nextStatus,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: nextPeriodEnd,
      });
    }

    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: 'No scheduled cancellation found' }, { status: 404 });
    }

    const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    const normalizedStatus = normalizeStripeSubscriptionStatus(updatedSubscription.status);
    const currentPeriodStart = getStripeSubscriptionPeriodStartIso(updatedSubscription);
    const currentPeriodEnd = getStripeSubscriptionPeriodEndIso(updatedSubscription);
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: normalizedStatus,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: Boolean(updatedSubscription.cancel_at_period_end),
        ...(isBillingActiveStripeStatus(normalizedStatus)
          ? {
              lifecycle_lapsed_at: null,
              lifecycle_archive_at: null,
              lifecycle_delete_at: null,
              lifecycle_archived_at: null,
              lifecycle_deleted_at: null,
              lifecycle_archive_notice_sent_at: null,
              lifecycle_delete_notice_sent_at: null,
              lifecycle_archive_warning_days_sent: [],
              lifecycle_delete_warning_days_sent: [],
              lifecycle_reminder_days_sent: [],
            }
          : {}),
        updated_at: nowIso,
      })
      .eq('stripe_subscription_id', stripeSubscriptionId);

    if (updateError) {
      console.error('Resume subscription: failed to update local subscription', updateError);
      return NextResponse.json({ error: 'Failed to update local subscription state' }, { status: 500 });
    }

    await syncUserEntitlementSnapshot(authUid);
    invalidateUserPlanCache(authUid);
    return NextResponse.json({
      ok: true,
      status: normalizedStatus,
      cancelAtPeriodEnd: Boolean(updatedSubscription.cancel_at_period_end),
      currentPeriodEnd,
    });
  } catch (error: any) {
    console.error('Resume subscription error', error);
    return NextResponse.json({ error: error?.message || 'Failed to resume subscription' }, { status: 500 });
  }
}
