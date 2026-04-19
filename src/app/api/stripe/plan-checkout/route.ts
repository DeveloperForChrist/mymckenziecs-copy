import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { stripe } from '@/lib/payments/stripe';
import { logApiUsage } from '@/lib/utils/api-usage-logger';
import { billingIpRateLimiter, billingRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit';
import { getAppUrl } from '@/lib/app-url';
import { SUBSCRIPTION_TRIAL_DAYS } from '@/lib/payments/trials';
import { isPaidPlan } from '@/lib/plans/access';

const STRIPE_CHECKOUT_SESSION_PLACEHOLDER = '{CHECKOUT_SESSION_ID}';

function resolveAppCheckoutSuccessUrl(request: NextRequest): string {
  const base = getAppUrl(request);
  return `${base}/checkout/success`;
}

function resolveAppPricingUrl(request: NextRequest): string {
  const base = getAppUrl(request);
  return `${base}/pricing`;
}

function withCheckoutParams(url: string, status: 'success' | 'cancelled') {
  const parsed = new URL(url);
  parsed.searchParams.set('checkout_status', status);
  parsed.searchParams.set('checkout', status);
  if (status === 'success') {
    parsed.searchParams.set('session_id', STRIPE_CHECKOUT_SESSION_PLACEHOLDER);
  }
  return parsed
    .toString()
    .replace(
      encodeURIComponent(STRIPE_CHECKOUT_SESSION_PLACEHOLDER),
      STRIPE_CHECKOUT_SESSION_PLACEHOLDER
    );
}

export async function POST(request: NextRequest) {
  try {
    const baseCheckoutSuccessUrl = resolveAppCheckoutSuccessUrl(request);
    const basePricingUrl = resolveAppPricingUrl(request);
    const defaultSuccessUrl = withCheckoutParams(baseCheckoutSuccessUrl, 'success');
    const defaultCancelUrl = withCheckoutParams(basePricingUrl, 'cancelled');
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = authData.user.id;
    const userEmail = authData.user.email;
    const ip = getClientIp(request.headers);

    const userLimit = await rateLimit(billingRateLimiter, `billing:user:${getIdentifier(authUid, ip)}`, 10, 10 * 60 * 1000);
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many billing requests. Please try again shortly.');
    }

    if (ip) {
      const ipLimit = await rateLimit(billingIpRateLimiter, `billing:ip:${ip}`, 30, 10 * 60 * 1000);
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many billing requests from this network. Please try again shortly.');
      }
    }

    const { planId, successUrl, cancelUrl } = await request.json();
    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // Find or create Stripe customer for user
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id, email_verified_at')
      .eq('id', authUid)
      .maybeSingle();

    const isEmailVerified = userRow
      ? Boolean((userRow as any)?.email_verified_at)
      : Boolean((authData.user as any)?.email_confirmed_at);

    if (!isEmailVerified) {
      const verifyRedirect = `/auth/verify-email?redirect=${encodeURIComponent(`/dashboard?activatePlan=${encodeURIComponent(String(planId))}`)}`;
      return NextResponse.json(
        {
          error: 'Verify your email before checkout',
          code: 'EMAIL_VERIFICATION_REQUIRED',
          redirect: verifyRedirect,
        },
        { status: 403 }
      );
    }

    // Check for existing subscription with stripe_customer_id
    let customerId: string | null = null;
    let hasPreviousSubscription = false;
    if (userRow) {
      const { data: existingSubs } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id, stripe_subscription_id, plan_type')
        .eq('user_id', userRow.id)
        .order('updated_at', { ascending: false });
      customerId = (existingSubs || []).find((row: any) => row?.stripe_customer_id)?.stripe_customer_id || null;
      hasPreviousSubscription = (existingSubs || []).some((row: any) =>
        Boolean(row?.stripe_subscription_id) || isPaidPlan(row?.plan_type || '')
      );
    }

    if (!customerId) {
      const started = Date.now();
      try {
        const customer = await stripe.customers.create({
          email: userEmail || undefined,
          metadata: { userId: authUid },
        });
        customerId = customer.id;
        void logApiUsage({
          provider: 'stripe',
          endpoint: 'customers.create',
          success: true,
          latencyMs: Date.now() - started,
          userId: authUid,
          metadata: { planId },
        });
      } catch (error: any) {
        void logApiUsage({
          provider: 'stripe',
          endpoint: 'customers.create',
          success: false,
          latencyMs: Date.now() - started,
          userId: authUid,
          error: error?.message || String(error),
          metadata: { planId },
        });
        throw error;
      }
    }
    // Create Stripe subscription checkout session
    const sessionStart = Date.now();
    try {
      const trialApplied = !hasPreviousSubscription;
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [
          { price: planId, quantity: 1 },
        ],
        metadata: { userId: authUid, planId, trialApplied: trialApplied ? 'true' : 'false' },
        subscription_data: {
          metadata: { userId: authUid, planId, trialApplied: trialApplied ? 'true' : 'false' },
          ...(trialApplied ? { trial_period_days: SUBSCRIPTION_TRIAL_DAYS } : {}),
        },
        success_url: successUrl ? withCheckoutParams(successUrl, 'success') : defaultSuccessUrl,
        cancel_url: cancelUrl ? withCheckoutParams(cancelUrl, 'cancelled') : defaultCancelUrl,
      });
      void logApiUsage({
        provider: 'stripe',
        endpoint: 'checkout.sessions.create',
        success: true,
        latencyMs: Date.now() - sessionStart,
        userId: authUid,
        metadata: { planId },
      });
      return NextResponse.json({ url: session.url });
    } catch (error: any) {
      void logApiUsage({
        provider: 'stripe',
        endpoint: 'checkout.sessions.create',
        success: false,
        latencyMs: Date.now() - sessionStart,
        userId: authUid,
        error: error?.message || String(error),
        metadata: { planId },
      });
      throw error;
    }
  } catch (error: any) {
    console.error('Plan checkout error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to start plan checkout' }, { status: 500 });
  }
}
