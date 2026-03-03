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
import { isBillingActiveStripeStatus, normalizeStripeSubscriptionStatus } from '@/lib/payments/subscription-status';

const BILLABLE_CANCELABLE_STATUSES = ['active', 'past_due', 'trialing'] as const;

const toIsoOrNull = (unixSeconds?: number | null) => {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
};

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
      `billing:cancel:user:${getIdentifier(authUid, ip)}`,
      10,
      10 * 60 * 1000
    );
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many cancellation requests. Please try again shortly.');
    }

    if (ip) {
      const ipLimit = await rateLimit(
        billingIpRateLimiter,
        `billing:cancel:ip:${ip}`,
        30,
        10 * 60 * 1000
      );
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many cancellation requests from this network. Please try again shortly.');
      }
    }

    const { data: subscriptionRow } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_subscription_id, status, cancel_at_period_end')
      .eq('user_id', authUid)
      .not('stripe_subscription_id', 'is', null)
      .in('status', [...BILLABLE_CANCELABLE_STATUSES])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const stripeSubscriptionId = subscriptionRow?.stripe_subscription_id || null;
    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: 'No active paid subscription found' }, { status: 404 });
    }

    const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const normalizedStatus = normalizeStripeSubscriptionStatus(updatedSubscription.status);
    const currentPeriodStart = toIsoOrNull(updatedSubscription.current_period_start);
    const currentPeriodEnd = toIsoOrNull(updatedSubscription.current_period_end);
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
      console.error('Cancel subscription: failed to update local subscription', updateError);
      return NextResponse.json({ error: 'Failed to update local subscription state' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: normalizedStatus,
      cancelAtPeriodEnd: Boolean(updatedSubscription.cancel_at_period_end),
      currentPeriodEnd,
    });
  } catch (error: any) {
    console.error('Cancel subscription error', error);
    return NextResponse.json({ error: error?.message || 'Failed to cancel subscription' }, { status: 500 });
  }
}
