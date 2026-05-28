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

const RESUMABLE_STATUSES = ['active', 'past_due'] as const;

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
