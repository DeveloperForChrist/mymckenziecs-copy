import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { stripe } from '@/lib/payments/stripe';

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

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = data.user.id;
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', authUid)
      .maybeSingle();

    if (!userRow) {
      return NextResponse.json({ hasCustomer: false, paymentMethod: null });
    }

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id, created_at')
      .eq('user_id', userRow.id)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .maybeSingle();

    const customerId = sub?.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json({ hasCustomer: false, paymentMethod: null });
    }

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
      return NextResponse.json({ hasCustomer: true, paymentMethod: null });
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

    return NextResponse.json({ hasCustomer: true, paymentMethod: summary });
  } catch (error: any) {
    console.error('Payment method API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
