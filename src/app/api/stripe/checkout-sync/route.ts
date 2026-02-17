import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { PLAN_PRICES } from '@/constants';
import { sendResendEmail } from '@/lib/email/resend';

function normalizePlanTypeFromPrice(priceId?: string | null): string {
  if (!priceId) return 'free';
  const match = PLAN_PRICES.find((plan) => plan.priceId === priceId);
  const name = (match?.name || '').toLowerCase();
  if (name.includes('premium cheap')) return 'premium cheap';
  if (name.includes('plus')) return 'premium pro';
  if (name.includes('essential')) return 'premium';
  if (name.includes('standard')) return 'standard';
  return 'free';
}

function normalizeSubscriptionStatus(status?: string | null): string {
  const raw = (status || '').toLowerCase();
  if (raw === 'canceled') return 'cancelled';
  return raw || 'active';
}

function isPaidSubscriptionStatus(status?: string | null): boolean {
  const normalized = normalizeSubscriptionStatus(status);
  return normalized === 'active' || normalized === 'past_due' || normalized === 'trialing';
}

async function upsertSubscriptionForUser(
  userId: string,
  userEmail: string | null | undefined,
  subscription: any,
  checkoutEmail?: string | null
) {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id || null;
  const stripeSubscriptionId = subscription.id;
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const planType = normalizePlanTypeFromPrice(priceId);
  const status = normalizeSubscriptionStatus(subscription.status);
  const currentPeriodStart = subscription.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : null;
  const currentPeriodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;
  const nowIso = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('plan_type, status')
    .eq('stripe_subscription_id', stripeSubscriptionId)
    .maybeSingle();

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
        updated_at: nowIso,
      },
      { onConflict: 'stripe_subscription_id' }
    );

  if (upsertError) {
    console.error('Checkout sync: failed to upsert subscription', upsertError);
    throw new Error('Failed to sync subscription');
  }

  if (isPaidSubscriptionStatus(status)) {
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({ freemium_since: null })
      .eq('id', userId);
    if (userError) {
      console.error('Checkout sync: failed to clear freemium_since', userError);
    }
  }

  const planChanged =
    !existing ||
    (existing.plan_type || '').toLowerCase() !== planType ||
    (existing.status || '').toLowerCase() !== status;

  const recipientEmail = userEmail || checkoutEmail || null;
  if (planChanged && recipientEmail && isPaidSubscriptionStatus(status)) {
    try {
      await sendResendEmail({
        to: recipientEmail,
        subject: 'Your MymckenzieCS plan is now active',
        htmlBody: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4c1d95;">Plan activated</h2>
            <p>Hi${recipientEmail ? ` ${recipientEmail}` : ''},</p>
            <p>Your paid plan is now active in MymckenzieCS.</p>
            <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">MymckenzieCS</p>
          </div>
        `,
        tag: 'billing-plan-activated',
      });
    } catch (emailError) {
      console.error('Checkout sync: failed to send activation email', emailError);
    }
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

      const result = await upsertSubscriptionForUser(userId, userEmail, subscription, checkoutEmail);
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

    const paidSub = subscriptions.data.find((sub: any) => isPaidSubscriptionStatus(sub.status));
    if (!paidSub) {
      return NextResponse.json({ ok: true, synced: false, reason: 'no-paid-subscription' });
    }

    const result = await upsertSubscriptionForUser(userId, userEmail, paidSub, userEmail);
    return NextResponse.json({ ok: true, synced: true, ...result });
  } catch (error: any) {
    console.error('Checkout sync error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to sync checkout session' }, { status: 500 });
  }
}
