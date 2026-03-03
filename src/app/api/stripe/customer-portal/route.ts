import { NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { logApiUsage } from '@/lib/utils/api-usage-logger';
import { billingIpRateLimiter, billingRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit';
import { getAppUrl } from '@/lib/app-url';

function resolveReturnUrl(request: Request): string {
  return `${getAppUrl(request)}/settings`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode === 'payment_method_update' ? 'payment_method_update' : 'manage';

    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = authData.user.id;
    const ip = getClientIp(req.headers);

    const userLimit = await rateLimit(billingRateLimiter, `billing:portal:user:${getIdentifier(authUid, ip)}`, 10, 10 * 60 * 1000);
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many billing portal requests. Please try again shortly.');
    }

    if (ip) {
      const ipLimit = await rateLimit(billingIpRateLimiter, `billing:portal:ip:${ip}`, 30, 10 * 60 * 1000);
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many billing portal requests from this network. Please try again shortly.');
      }
    }

    // Fetch the latest known Stripe customer ID for this user.
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', authUid)
      .not('stripe_customer_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const customerId = subscription?.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer ID on user record' }, { status: 400 });
    }

    const returnUrl = resolveReturnUrl(req);
    const sessionStart = Date.now();
    let session;
    try {
      const createParams: any = {
        customer: customerId,
        return_url: returnUrl,
      };

      if (mode === 'payment_method_update') {
        createParams.flow_data = {
          type: 'payment_method_update',
          after_completion: {
            type: 'redirect',
            redirect: { return_url: returnUrl },
          },
        };
      }

      session = await stripe.billingPortal.sessions.create(createParams);
      void logApiUsage({
        provider: 'stripe',
        endpoint: 'billingPortal.sessions.create',
        success: true,
        latencyMs: Date.now() - sessionStart,
        userId: authUid,
      });
    } catch (error: any) {
      void logApiUsage({
        provider: 'stripe',
        endpoint: 'billingPortal.sessions.create',
        success: false,
        latencyMs: Date.now() - sessionStart,
        userId: authUid,
        error: error?.message || String(error),
      });
      throw error;
    }

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('Customer portal error', err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
