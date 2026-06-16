import { NextResponse } from 'next/server';
import { validateCsrfToken } from '@/lib/security/csrf'
import fs from 'fs';
import path from 'path';
import { stripe } from '@/lib/payments/stripe';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';
import { getAppUrl } from '@/lib/app-url';
import {
  billingIpRateLimiter,
  billingRateLimiter,
  getClientIp,
  getIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from '@/lib/utils/rate-limit';
import { syncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { invalidateUserPlanCache } from '@/lib/payments/user-plan';
import { isBillingActiveStripeStatus, normalizeStripeSubscriptionStatus } from '@/lib/payments/subscription-status';
import { getStripeSubscriptionPeriodEndIso, getStripeSubscriptionPeriodStartIso } from '@/lib/payments/subscription-period';
import { planDisplayName } from '@/lib/plans/access';
import { getBillingMarketFromCountryCode } from '@/constants';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';

const BILLABLE_CANCELABLE_STATUSES = ['active', 'past_due', 'trialing'] as const;
const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

function formatDateShort(value?: string | null) {
  if (!value) return 'the scheduled end date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'the scheduled end date';
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export async function POST(req: Request) {
  try {
    if (!await validateCsrfToken(req as any)) {
      return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 })
    }
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = authData.user.id;
    const ip = getClientIp(req.headers);

    const userLimit = await rateLimit(
      billingRateLimiter,
      `billing:cancel:user:${getIdentifier(authUid, ip)}`,
      10,
      10 * 60 * 1000
    );
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many cancellation requests. Please try again shortly.');
    }

    if (ip) {
      const ipLimit = await rateLimit(
        billingIpRateLimiter,
        `billing:cancel:ip:${ip}`,
        30,
        10 * 60 * 1000
      );
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many cancellation requests from this network. Please try again shortly.');
      }
    }

    const { data: subscriptionRow } = await supabaseAdmin
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, cancel_at_period_end, plan_type, current_period_end')
      .eq('user_id', authUid)
      .in('status', [...BILLABLE_CANCELABLE_STATUSES])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionRow?.cancel_at_period_end) {
      return NextResponse.json({
        ok: true,
        alreadyScheduled: true,
        status: String(subscriptionRow?.status || '').toLowerCase() || 'active',
        cancelAtPeriodEnd: true,
      });
    }

    const stripeSubscriptionId = subscriptionRow?.stripe_subscription_id || null;
    if (!stripeSubscriptionId && String(subscriptionRow?.status || '').toLowerCase() === 'trialing') {
      const nowIso = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from('subscriptions')
        .update({
          cancel_at_period_end: true,
          scheduled_plan_type: null,
          scheduled_change_at: null,
          updated_at: nowIso,
        })
        .eq('id', subscriptionRow?.id);

      if (updateError) {
        console.error('Cancel subscription: failed to update local trial cancellation', updateError);
        return NextResponse.json({ error: 'Failed to update local trial state' }, { status: 500 });
      }

      await syncUserEntitlementSnapshot(authUid);
      invalidateUserPlanCache(authUid);

      try {
        const { data: userRow } = await supabaseAdmin
          .from('users')
          .select('email, name, country_code')
          .eq('id', authUid)
          .maybeSingle();

        if (userRow?.email) {
          const planName = planDisplayName(subscriptionRow?.plan_type || 'No plan');
          const endDate = formatDateShort(subscriptionRow?.current_period_end || null);
          const appUrl = getAppUrl(req);
          const supportEmail = process.env.SUPPORT_EMAIL || 'jordan@lenjordan.tech';
          const billingMarket = getBillingMarketFromCountryCode((userRow as any)?.country_code || null);
          const htmlBody = renderTemplate('29-cancellation-scheduled.html', {
            heading: 'Your cancellation is confirmed',
            name: userRow.name || 'there',
            summary_text: `This confirms that your <strong>${planName}</strong> access has been scheduled to end on <strong>${endDate}</strong>.`,
            detail_text:
              'Your workspace will remain active until that date. Billing will not begin unless you resume the plan before access ends.',
            manage_url: `${appUrl}${getAppRouteForMarket('/settings?tab=billing', billingMarket)}`,
            support_email: supportEmail,
          });

          await sendResendEmail({
            to: userRow.email,
            subject: `Your MyMcKenzieCS access will end on ${endDate}`,
            htmlBody,
            tag: 'billing-trial-cancellation-scheduled',
          });
        }
      } catch (emailError) {
        console.error('Cancel subscription: failed to send local trial cancellation email', emailError);
      }

      return NextResponse.json({
        ok: true,
        status: 'trialing',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: subscriptionRow?.current_period_end || null,
      });
    }

    if (!stripeSubscriptionId) {
      return NextResponse.json({ error: 'No active paid subscription found' }, { status: 404 });
    }

    const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    const normalizedStatus = normalizeStripeSubscriptionStatus(updatedSubscription.status);
    const currentPeriodStart = getStripeSubscriptionPeriodStartIso(updatedSubscription);
    const currentPeriodEnd = getStripeSubscriptionPeriodEndIso(updatedSubscription);
    const nowIso = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from('subscriptions')
      .update({
        status: normalizedStatus,
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: Boolean(updatedSubscription.cancel_at_period_end),
        scheduled_plan_type: null,
        scheduled_change_at: null,
        ...(isBillingActiveStripeStatus(normalizedStatus)
          ? {
              lifecycle_lapsed_at: null,
              lifecycle_archive_at: null,
              lifecycle_delete_at: null,
              lifecycle_archived_at: null,
              lifecycle_deleted_at: null,
              lifecycle_archive_notice_sent_at: null,
              lifecycle_delete_notice_sent_at: null,
              lifecycle_archive_warning_days_sent: [],
              lifecycle_delete_warning_days_sent: [],
              lifecycle_reminder_days_sent: [],
            }
          : {}),
        updated_at: nowIso,
      })
      .eq('stripe_subscription_id', stripeSubscriptionId);

    if (updateError) {
      console.error('Cancel subscription: failed to update local subscription', updateError);
      return NextResponse.json({ error: 'Failed to update local subscription state' }, { status: 500 });
    }

    await syncUserEntitlementSnapshot(authUid);
    invalidateUserPlanCache(authUid);

    try {
      const { data: userRow } = await supabaseAdmin
        .from('users')
        .select('email, name, country_code')
        .eq('id', authUid)
        .maybeSingle();

      if (userRow?.email) {
        const isTrialCancellation = normalizedStatus === 'trialing';
        const planName = planDisplayName(subscriptionRow?.plan_type || 'No plan');
        const endDate = formatDateShort(currentPeriodEnd);
        const appUrl = getAppUrl(req);
        const supportEmail = process.env.SUPPORT_EMAIL || 'jordan@lenjordan.tech';
        const billingMarket = getBillingMarketFromCountryCode((userRow as any)?.country_code || null);
        const htmlBody = renderTemplate('29-cancellation-scheduled.html', {
          heading: isTrialCancellation ? 'Your cancellation is confirmed' : 'Your cancellation is confirmed',
          name: userRow.name || 'there',
          summary_text: isTrialCancellation
            ? `This confirms that your <strong>${planName}</strong> access has been scheduled to end on <strong>${endDate}</strong>.`
            : `This confirms that your <strong>${planName}</strong> subscription has been scheduled to end on <strong>${endDate}</strong>.`,
          detail_text: isTrialCancellation
            ? 'Your workspace will remain active until that date. Billing will not begin unless you resume the plan before access ends.'
            : 'Your access will remain active until that date. Automatic renewal has been turned off, and no further renewal charges will be made unless you resume before then.',
          manage_url: `${appUrl}${getAppRouteForMarket('/settings?tab=billing', billingMarket)}`,
          support_email: supportEmail,
        });

        await sendResendEmail({
          to: userRow.email,
          subject: isTrialCancellation
            ? `Your MyMcKenzieCS access will end on ${endDate}`
            : `Your MyMcKenzieCS subscription will end on ${endDate}`,
          htmlBody,
          tag: isTrialCancellation ? 'billing-trial-cancellation-scheduled' : 'billing-cancellation-scheduled',
        });
      }
    } catch (emailError) {
      console.error('Cancel subscription: failed to send cancellation confirmation email', emailError);
    }

    return NextResponse.json({
      ok: true,
      status: normalizedStatus,
      cancelAtPeriodEnd: Boolean(updatedSubscription.cancel_at_period_end),
      currentPeriodEnd,
    });
  } catch (error: any) {
    console.error('Cancel subscription error', error);
    return NextResponse.json({ error: error?.message || 'Failed to cancel subscription' }, { status: 500 });
  }
}
