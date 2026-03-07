import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { stripe } from '@/lib/payments/stripe';
import { PLAN_PRICES } from '@/constants';
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

const CHANGEABLE_STATUSES = ['active', 'past_due', 'trialing'] as const;

function normalizePlanTypeFromPrice(priceId?: string | null): string {
  if (!priceId) return 'No plan';
  const match = PLAN_PRICES.find((plan) => plan.priceId === priceId);
  const name = (match?.name || '').toLowerCase();
  if (name.includes('basic') || name.includes('essential') || name.includes('premium cheap')) return 'Basic';
  if (name.includes('premium +') || name.includes('premium plus') || name.includes('plus') || name.includes('premium pro')) return 'Premium +';
  if (name.includes('premium')) return 'Premium';
  return 'No plan';
}

function planRank(plan: string): number {
  const normalized = plan.toLowerCase();
  if (normalized.includes('premium +') || normalized.includes('premium plus') || normalized.includes('premium pro') || normalized === 'plus') {
    return 3;
  }
  if (normalized.includes('premium')) return 2;
  if (normalized.includes('basic') || normalized.includes('essential') || normalized.includes('premium cheap')) return 1;
  return 0;
}

function toIsoOrNull(unixSeconds?: number | null) {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

async function releaseExistingSchedule(scheduleId?: string | null) {
  if (!scheduleId) return;
  try {
    await stripe.subscriptionSchedules.release(scheduleId);
  } catch (error: any) {
    const message = String(error?.message || '');
    if (!message.toLowerCase().includes('released')) {
      throw error;
    }
  }
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
      `billing:change-plan:user:${getIdentifier(authUid, ip)}`,
      10,
      10 * 60 * 1000
    );
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many plan change requests. Please try again shortly.');
    }

    if (ip) {
      const ipLimit = await rateLimit(
        billingIpRateLimiter,
        `billing:change-plan:ip:${ip}`,
        30,
        10 * 60 * 1000
      );
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many plan change requests from this network. Please try again shortly.');
      }
    }

    const body = await req.json().catch(() => ({}));
    const requestedPriceId = typeof body?.planId === 'string' ? body.planId.trim() : '';
    const requestedPlan = PLAN_PRICES.find((plan) => plan.priceId === requestedPriceId);
    if (!requestedPlan) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 });
    }

    const { data: subscriptionRow } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_subscription_id, status')
      .eq('user_id', authUid)
      .not('stripe_subscription_id', 'is', null)
      .in('status', [...CHANGEABLE_STATUSES])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const stripeSubscriptionId = subscriptionRow?.stripe_subscription_id || null;
    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: 'No active paid subscription found' }, { status: 404 });
    }

    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['schedule'],
    });
    const currentItem = subscription.items?.data?.[0];
    const currentPriceId = currentItem?.price?.id || null;
    const currentPlan = normalizePlanTypeFromPrice(currentPriceId);
    const targetPlan = normalizePlanTypeFromPrice(requestedPriceId);

    if (!currentItem?.id || !currentPriceId) {
      return NextResponse.json({ error: 'Subscription is missing a billable price item' }, { status: 400 });
    }

    if (currentPriceId === requestedPriceId || currentPlan === targetPlan) {
      return NextResponse.json({
        ok: true,
        changeTiming: 'unchanged',
        currentPlan,
        targetPlan,
      });
    }

    const currentRank = planRank(currentPlan);
    const targetRank = planRank(targetPlan);
    const scheduleId =
      subscription.schedule && typeof subscription.schedule !== 'string'
        ? subscription.schedule.id
        : typeof subscription.schedule === 'string'
          ? subscription.schedule
          : null;

    if (targetRank > currentRank) {
      if (scheduleId) {
        await releaseExistingSchedule(scheduleId);
      }

      const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false,
        proration_behavior: 'always_invoice',
        items: [
          {
            id: currentItem.id,
            price: requestedPriceId,
          },
        ],
      });

      const normalizedStatus = normalizeStripeSubscriptionStatus(updatedSubscription.status);
      const currentPeriodStart = toIsoOrNull(updatedSubscription.current_period_start);
      const currentPeriodEnd = toIsoOrNull(updatedSubscription.current_period_end);

      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          plan_type: targetPlan,
          status: normalizedStatus,
          current_period_start: currentPeriodStart,
          current_period_end: currentPeriodEnd,
          cancel_at_period_end: Boolean(updatedSubscription.cancel_at_period_end),
          scheduled_plan_type: null,
          scheduled_change_at: null,
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
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', updatedSubscription.id);

      if (updateError) {
        console.error('Change plan: failed to persist immediate plan update', updateError);
        return NextResponse.json({ error: 'Failed to update local plan state' }, { status: 500 });
      }

      await syncUserEntitlementSnapshot(authUid);
      invalidateUserPlanCache(authUid);
      return NextResponse.json({
        ok: true,
        changeTiming: 'immediate',
        currentPlan,
        targetPlan,
      });
    }

    const currentPeriodEnd = subscription.current_period_end;
    const currentPeriodStart = subscription.current_period_start;
    if (!currentPeriodEnd || !currentPeriodStart) {
      return NextResponse.json({ error: 'Subscription is missing billing period dates' }, { status: 400 });
    }

    const schedule = scheduleId
      ? await stripe.subscriptionSchedules.retrieve(scheduleId)
      : await stripe.subscriptionSchedules.create({ from_subscription: subscription.id });

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      phases: [
        {
          start_date: currentPeriodStart,
          end_date: currentPeriodEnd,
          items: [
            {
              price: currentPriceId,
              quantity: currentItem.quantity || 1,
            },
          ],
          proration_behavior: 'none',
        },
        {
          start_date: currentPeriodEnd,
          items: [
            {
              price: requestedPriceId,
              quantity: currentItem.quantity || 1,
            },
          ],
          proration_behavior: 'none',
        },
      ],
    });

    const { error: schedulePersistError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        scheduled_plan_type: targetPlan,
        scheduled_change_at: new Date(currentPeriodEnd * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subscription.id);

    if (schedulePersistError) {
      console.error('Change plan: failed to persist scheduled plan change', schedulePersistError);
      return NextResponse.json({ error: 'Failed to persist scheduled plan change' }, { status: 500 });
    }

    await syncUserEntitlementSnapshot(authUid);
    invalidateUserPlanCache(authUid);
    return NextResponse.json({
      ok: true,
      changeTiming: 'period_end',
      currentPlan,
      targetPlan,
      effectiveDate: new Date(currentPeriodEnd * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('Change plan error', error);
    return NextResponse.json({ error: error?.message || 'Failed to change plan' }, { status: 500 });
  }
}
