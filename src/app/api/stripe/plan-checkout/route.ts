import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { stripe } from '@/lib/payments/stripe';
import { logApiUsage } from '@/lib/utils/api-usage-logger';
import { billingIpRateLimiter, billingRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit';

function resolveAppSettingsUrl(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/settings`;
  }

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';

  if (host) {
    return `${protocol}://${host}/settings`;
  }

  return 'http://localhost:3000/settings';
}

function withCheckoutParams(url: string, status: 'success' | 'cancelled') {
  const parsed = new URL(url);
  parsed.searchParams.set('checkout', status);
  if (status === 'success') {
    parsed.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  }
  return parsed.toString();
}

export async function POST(request: NextRequest) {
  try {
    const baseSettingsUrl = resolveAppSettingsUrl(request);
    const defaultSuccessUrl = withCheckoutParams(baseSettingsUrl, 'success');
    const defaultCancelUrl = withCheckoutParams(baseSettingsUrl, 'cancelled');
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
      .select('id')
      .eq('id', authUid)
      .maybeSingle();

    // Check for existing subscription with stripe_customer_id
    let customerId: string | null = null;
    if (userRow) {
      const { data: existingSub } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', userRow.id)
        .maybeSingle();
      customerId = existingSub?.stripe_customer_id || null;
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
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customerId,
        line_items: [
          { price: planId, quantity: 1 },
        ],
        metadata: { userId: authUid, planId },
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
