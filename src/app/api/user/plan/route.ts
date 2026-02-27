import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { BILLING_ACTIVE_STATUSES } from '@/lib/payments/subscription-status';
import { planPriceForLabel } from '@/lib/plans/access';

function hasPaidPlanLabel(plan: unknown): boolean {
  const label = String(plan || '').toLowerCase();
  return label.includes('basic') || label.includes('premium');
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = data.user.id;
    const authEmail = (data.user.email || '').trim();

    // Prefer currently billable subscription states first.
    const { data: activeSub } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id, lifecycle_archive_at, lifecycle_delete_at'
      )
      .eq('user_id', authUid)
      .in('status', [...BILLING_ACTIVE_STATUSES])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let resolvedSub = activeSub;

    // Extra fallback: handle environments where subscriptions are linked to a
    // legacy/mismatched user_id by resolving through the same auth email.
    if (!resolvedSub && authEmail) {
      const { data: emailUsers } = await supabaseAdmin
        .from('users')
        .select('id')
        .ilike('email', authEmail);

      const emailUserIds = (emailUsers || []).map((row: any) => row.id).filter(Boolean);
      if (emailUserIds.length > 0) {
        const { data: emailActiveSub } = await supabaseAdmin
          .from('subscriptions')
          .select(
            'plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id, lifecycle_archive_at, lifecycle_delete_at'
          )
          .in('user_id', emailUserIds)
          .in('status', [...BILLING_ACTIVE_STATUSES])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (emailActiveSub) {
          resolvedSub = emailActiveSub;
        }
      }
    }

    const { data: latestSub } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'plan_type, status, current_period_end, stripe_subscription_id, stripe_customer_id, lifecycle_archive_at, lifecycle_delete_at'
      )
      .eq('user_id', authUid)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const displaySub = resolvedSub || latestSub;
    const rawPlan = displaySub?.plan_type || 'Free';
    const planPrice = displaySub ? planPriceForLabel(rawPlan) : '0';
    const activeStatus = (resolvedSub?.status || '').toLowerCase();
    const paidAccess = Boolean(
      resolvedSub &&
      hasPaidPlanLabel(resolvedSub.plan_type) &&
      BILLING_ACTIVE_STATUSES.some((value) => value === activeStatus)
    );
    let hasStripeCustomer = !!(displaySub?.stripe_customer_id || displaySub?.stripe_subscription_id);

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
      planStatus: displaySub?.status || 'free',
      planPrice,
      nextBillingDate: displaySub?.current_period_end || null,
      hasStripeCustomer,
      paidAccess,
      canResume: !paidAccess && Boolean(displaySub?.stripe_customer_id || displaySub?.stripe_subscription_id),
      archiveAt: displaySub?.lifecycle_archive_at || null,
      deleteAt: displaySub?.lifecycle_delete_at || null,
    };

    return NextResponse.json(planData);
  } catch (error: any) {
    console.error('Plan API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
