import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { isBillingActiveStripeStatus, normalizeStripeSubscriptionStatus } from '@/lib/payments/subscription-status';
import { syncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { invalidateUserPlanCache } from '@/lib/payments/user-plan';
import { findPlanByAnyPriceId } from '@/constants';
import { getStripeSubscriptionPeriodEndIso, getStripeSubscriptionPeriodStartIso } from '@/lib/payments/subscription-period';

function normalizePlanTypeFromPrice(priceId?: string | null): string {
  if (!priceId) return 'No plan';
  const name = (findPlanByAnyPriceId(priceId)?.name || '').toLowerCase();
  if (name.includes('basic') || name.includes('essential') || name.includes('premium cheap')) return 'Basic';
  if (name.includes('premium +') || name.includes('premium plus') || name.includes('plus') || name.includes('premium pro')) return 'Premium +';
  if (name.includes('premium')) return 'Premium';
  return 'No plan';
}

async function upsertSubscriptionForUser(
  userId: string,
  subscription: any
) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id || null;
  const stripeSubscriptionId = subscription.id;
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const planType = normalizePlanTypeFromPrice(priceId);
  const status = normalizeStripeSubscriptionStatus(subscription.status);
  const currentPeriodStart = getStripeSubscriptionPeriodStartIso(subscription);
  const currentPeriodEnd = getStripeSubscriptionPeriodEndIso(subscription);
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_type, status, scheduled_plan_type, scheduled_change_at')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();

  const scheduledPlanType = existing?.scheduled_plan_type || null;
  const scheduledPlanApplied = scheduledPlanType !== null && scheduledPlanType === planType;

  const { error: upsertError } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_customer_id: customerId,
        plan_type: planType,
        status,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        scheduled_plan_type: scheduledPlanApplied ? null : scheduledPlanType,
        scheduled_change_at: scheduledPlanApplied ? null : existing?.scheduled_change_at || null,
        ...(isBillingActiveStripeStatus(status)
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
      },
      { onConflict: 'stripe_subscription_id' }
    );

  if (upsertError) {
    console.error('Checkout sync: failed to upsert subscription', upsertError);
    throw new Error('Failed to sync subscription');
  }

  const planChanged =
    !existing ||
    (existing.plan_type || '').toLowerCase() !== planType ||
    (existing.status || '').toLowerCase() !== status;

  if (planChanged) {
    await syncUserEntitlementSnapshot(userId);
    invalidateUserPlanCache(userId);
  }

  return { planType, status };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const sessionId = body?.sessionId as string | undefined;
    const userId = authData.user.id;
    const userEmail = authData.user.email || null;

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(String(sessionId), {
        expand: ['subscription', 'customer'],
      });

      const metadataUserId = session?.metadata?.userId || null;
      if (metadataUserId && metadataUserId !== userId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const checkoutEmail = session?.customer_details?.email || session?.customer_email || null;
      if (!metadataUserId && checkoutEmail && userEmail && checkoutEmail !== userEmail) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;

      if (!subscriptionId) {
        return NextResponse.json({ error: 'No subscription found for checkout session' }, { status: 400 });
      }

      const subscription =
        typeof session.subscription === 'string'
          ? await stripe.subscriptions.retrieve(subscriptionId)
          : session.subscription;

      const result = await upsertSubscriptionForUser(userId, subscription);
      return NextResponse.json({ ok: true, ...result });
    }

    if (!userEmail) {
      return NextResponse.json({ ok: true, synced: false, reason: 'no-user-email' });
    }

    const customers = await stripe.customers.list({ email: userEmail, limit: 10 });
    const matchedCustomer =
      customers.data.find((c: any) => c?.metadata?.userId === userId) ||
      customers.data[0] ||
      null;

    if (!matchedCustomer) {
      return NextResponse.json({ ok: true, synced: false, reason: 'no-customer' });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: matchedCustomer.id,
      status: 'all',
      limit: 20,
    });

    const paidSub = subscriptions.data.find((sub: any) => isBillingActiveStripeStatus(sub.status));
    if (!paidSub) {
      return NextResponse.json({ ok: true, synced: false, reason: 'no-paid-subscription' });
    }

    const result = await upsertSubscriptionForUser(userId, paidSub);
    return NextResponse.json({ ok: true, synced: true, ...result });
  } catch (error: any) {
    console.error('Checkout sync error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to sync checkout session' }, { status: 500 });
  }
}
