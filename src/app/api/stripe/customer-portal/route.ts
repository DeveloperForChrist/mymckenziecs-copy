import { NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { logApiUsage } from '@/lib/utils/api-usage-logger';

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = authData.user.id;

    // Fetch user's subscription to get stripeCustomerId
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', authUid)
      .maybeSingle();

    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userRow.id)
      .maybeSingle();

    const customerId = subscription?.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer ID on user record' }, { status: 400 });
    }

    const returnUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/settings';
    const sessionStart = Date.now();
    let session;
    try {
      session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
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
