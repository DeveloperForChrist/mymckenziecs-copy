import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { stripe } from '@/lib/payments/stripe';
import { syncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { invalidateUserPlanCache } from '@/lib/payments/user-plan';
import {
  billingIpRateLimiter,
  billingRateLimiter,
  getClientIp,
  getIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from '@/lib/utils/rate-limit';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type PaymentMethodSummary = {
  brand?: string | null;
  last4?: string | null;
  exp_month?: number | null;
  exp_year?: number | null;
  name?: string | null;
  country?: string | null;
};

type BillingContext = {
  customerId: string | null;
  subscriptionId: string | null;
};

const ACTIVE_OR_RECOVERABLE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due', 'incomplete'] as const;

async function getBillingContext(userId: string): Promise<BillingContext> {
  const [{ data: customerRow }, { data: activeSubscriptionRow }] = await Promise.all([
    supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, created_at')
      .eq('user_id', userId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('subscriptions')
      .select('stripe_subscription_id, status, updated_at')
      .eq('user_id', userId)
      .not('stripe_subscription_id', 'is', null)
      .in('status', [...ACTIVE_OR_RECOVERABLE_SUBSCRIPTION_STATUSES])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    customerId: customerRow?.stripe_customer_id || null,
    subscriptionId: activeSubscriptionRow?.stripe_subscription_id || null,
  };
}

async function buildPaymentMethodSummary(customerId: string) {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ['invoice_settings.default_payment_method'],
  });

  let paymentMethod: any = (customer as any)?.invoice_settings?.default_payment_method || null;

  if (!paymentMethod) {
    const list = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });
    paymentMethod = list?.data?.[0] || null;
  }

  if (!paymentMethod || paymentMethod.type !== 'card') {
    return { hasCustomer: true, paymentMethod: null };
  }

  const card = paymentMethod.card || {};
  const summary: PaymentMethodSummary = {
    brand: card.brand || null,
    last4: card.last4 || null,
    exp_month: card.exp_month || null,
    exp_year: card.exp_year || null,
    name: paymentMethod.billing_details?.name || null,
    country: card.country || null,
  };

  return { hasCustomer: true, paymentMethod: summary };
}

async function requireAuthenticatedUser() {
  const supabase = await createSupabaseRouteClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  return data.user;
}

async function applyBillingRateLimit(req: Request, authUid: string, action: string) {
  const ip = getClientIp(req.headers);

  const userLimit = await rateLimit(
    billingRateLimiter,
    `billing:payment-method:${action}:user:${getIdentifier(authUid, ip)}`,
    10,
    10 * 60 * 1000
  );
  if (!userLimit.success) {
    return rateLimitExceededResponse(userLimit, 'Too many billing requests. Please try again shortly.');
  }

  if (ip) {
    const ipLimit = await rateLimit(
      billingIpRateLimiter,
      `billing:payment-method:${action}:ip:${ip}`,
      30,
      10 * 60 * 1000
    );
    if (!ipLimit.success) {
      return rateLimitExceededResponse(ipLimit, 'Too many billing requests from this network. Please try again shortly.');
    }
  }

  return null;
}

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId } = await getBillingContext(user.id);
    if (!customerId) {
      return NextResponse.json({ hasCustomer: false, paymentMethod: null });
    }

    const summary = await buildPaymentMethodSummary(customerId);
    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('Payment method API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limited = await applyBillingRateLimit(req, user.id, 'setup-intent');
    if (limited) return limited;

    const { customerId: existingCustomerId } = await getBillingContext(user.id);
    let customerId = existingCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: { userId: user.id },
    });

    if (!setupIntent.client_secret) {
      return NextResponse.json({ error: 'Failed to initialize payment method update' }, { status: 500 });
    }

    return NextResponse.json({
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (error: any) {
    console.error('Create payment method setup intent error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to initialize payment method update' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limited = await applyBillingRateLimit(req, user.id, 'finalize');
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const setupIntentId = typeof body?.setupIntentId === 'string' ? body.setupIntentId.trim() : '';
    if (!setupIntentId) {
      return NextResponse.json({ error: 'setupIntentId is required' }, { status: 400 });
    }

    const { customerId, subscriptionId } = await getBillingContext(user.id);
    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer ID on user record' }, { status: 400 });
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const setupIntentCustomerId =
      typeof setupIntent.customer === 'string'
        ? setupIntent.customer
        : setupIntent.customer?.id || null;

    if (!setupIntentCustomerId || setupIntentCustomerId !== customerId) {
      return NextResponse.json({ error: 'This payment method update does not belong to the current customer' }, { status: 400 });
    }

    if (setupIntent.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment method setup is not complete yet' }, { status: 400 });
    }

    const paymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id || null;

    if (!paymentMethodId) {
      return NextResponse.json({ error: 'No payment method was attached to the setup intent' }, { status: 400 });
    }

    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    if (subscriptionId) {
      await stripe.subscriptions.update(subscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }

    await syncUserEntitlementSnapshot(user.id);
    invalidateUserPlanCache(user.id);

    const summary = await buildPaymentMethodSummary(customerId);
    return NextResponse.json({
      ok: true,
      hasCustomer: summary.hasCustomer,
      paymentMethod: summary.paymentMethod,
    });
  } catch (error: any) {
    console.error('Finalize payment method update error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to save payment method' }, { status: 500 });
  }
}
