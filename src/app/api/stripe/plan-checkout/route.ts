import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { stripe } from '@/lib/payments/stripe';
import { logApiUsage } from '@/lib/utils/api-usage-logger';

const DEFAULT_SUCCESS_URL = process.env.NEXT_PUBLIC_APP_URL
  ? `${process.env.NEXT_PUBLIC_APP_URL}/settings`
  : 'http://localhost:3000/settings';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = authData.user.id;
    const userEmail = authData.user.email;

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
        success_url: successUrl || DEFAULT_SUCCESS_URL,
        cancel_url: cancelUrl || DEFAULT_SUCCESS_URL,
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
