import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { planPriceForLabel } from '@/lib/plans/access';

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = data.user.id;

    // Resolve Supabase user row
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', authUid)
      .maybeSingle();

    if (!userRow) {
      return NextResponse.json({
        plan: 'Free',
        planStatus: 'Active',
        planPrice: '0',
        nextBillingDate: null,
        hasStripeCustomer: false
      });
    }

    // Check for active or grace-period subscription
    const { data: activeSub } = await supabaseAdmin
      .from('subscriptions')
      .select('plan_type, status, current_period_end, stripe_subscription_id')
      .eq('user_id', userRow.id)
      .in('status', ['active', 'past_due'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const rawPlan = activeSub?.plan_type || 'Free';
    const planPrice = activeSub ? planPriceForLabel(rawPlan) : '0';

    const planData = {
      plan: rawPlan,
      planStatus: activeSub?.status || 'Active',
      planPrice,
      nextBillingDate: activeSub?.current_period_end || null,
      hasStripeCustomer: !!activeSub?.stripe_subscription_id
    };

    return NextResponse.json(planData);
  } catch (error: any) {
    console.error('Plan API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
