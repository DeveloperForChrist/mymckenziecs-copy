import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { BILLING_ACTIVE_STATUSES } from '@/lib/payments/subscription-status';
import { isPaidPlan, planPriceForLabel } from '@/lib/plans/access';

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = data.user.id;

    // Prefer currently billable subscription states first.
    const { data: activeSub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id')
      .eq('user_id', authUid)
      .in('status', [...BILLING_ACTIVE_STATUSES])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Fallback for legacy rows where status may be stale but plan is still paid.
    let resolvedSub = activeSub;
    if (!resolvedSub) {
      const { data: latestSub } = await supabaseAdmin
        .from('subscriptions')
        .select('plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id')
        .eq('user_id', authUid)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestSub && isPaidPlan(latestSub.plan_type)) {
        resolvedSub = latestSub;
      }
    }

    const rawPlan = resolvedSub?.plan_type || 'Free';
    const planPrice = resolvedSub ? planPriceForLabel(rawPlan) : '0';
    let hasStripeCustomer = !!(resolvedSub?.stripe_customer_id || resolvedSub?.stripe_subscription_id);

    if (!hasStripeCustomer) {
      const { data: latestCustomerSub } = await supabaseAdmin
        .from('subscriptions')
        .select('stripe_customer_id, stripe_subscription_id')
        .eq('user_id', authUid)
        .or('stripe_customer_id.not.is.null,stripe_subscription_id.not.is.null')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      hasStripeCustomer = !!(latestCustomerSub?.stripe_customer_id || latestCustomerSub?.stripe_subscription_id);
    }

    const planData = {
      plan: rawPlan,
      planStatus: resolvedSub?.status || 'free',
      planPrice,
      nextBillingDate: resolvedSub?.current_period_end || null,
      hasStripeCustomer
    };

    return NextResponse.json(planData);
  } catch (error: any) {
    console.error('Plan API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
