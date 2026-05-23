import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { findPlanByAnyPriceId } from '@/constants';
import { getBillingMarketFromCountryCode } from '@/constants';
import { getAppUrl } from '@/lib/app-url';
import { getAppRouteForMarket } from '@/lib/markets/app-routes';
import {
  billingIpRateLimiter,
  billingRateLimiter,
  getClientIp,
  getIdentifier,
  rateLimit,
  rateLimitExceededResponse,
} from '@/lib/utils/rate-limit';
import { getSubscriptionTrialEnd } from '@/lib/payments/trials';
import { getUserPlanData, invalidateUserPlanCache } from '@/lib/payments/user-plan';
import { syncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { isPaidPlan, planDisplayName } from '@/lib/plans/access';
import { sendResendEmail } from '@/lib/email/resend';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

function formatDateLabel(value?: Date | string | number | null) {
  if (!value) return 'soon';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'soon';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function buildVerifyRedirect(
  request: NextRequest,
  planId: string,
  market: Parameters<typeof getAppRouteForMarket>[1]
) {
  const verifyPath = getAppRouteForMarket(`/dashboard?activatePlan=${encodeURIComponent(planId)}`, market);
  const absolute = new URL('/auth/verify-email', getAppUrl(request));
  absolute.searchParams.set('redirect', verifyPath);
  return `${absolute.pathname}${absolute.search}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const authUid = authData.user.id;
    const ip = getClientIp(request.headers);

    const userLimit = await rateLimit(
      billingRateLimiter,
      `billing:start-trial:user:${getIdentifier(authUid, ip)}`,
      10,
      10 * 60 * 1000
    );
    if (!userLimit.success) {
      return rateLimitExceededResponse(userLimit, 'Too many trial start requests. Please try again shortly.');
    }

    if (ip) {
      const ipLimit = await rateLimit(
        billingIpRateLimiter,
        `billing:start-trial:ip:${ip}`,
        30,
        10 * 60 * 1000
      );
      if (!ipLimit.success) {
        return rateLimitExceededResponse(ipLimit, 'Too many trial start requests from this network. Please try again shortly.');
      }
    }

    const body = await request.json().catch(() => ({}));
    const planId = typeof body?.planId === 'string' ? body.planId.trim() : '';
    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    const requestedPlan = findPlanByAnyPriceId(planId);
    if (!requestedPlan) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 });
    }

    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id, email, name, email_verified_at, country_code, billing_audience')
      .eq('id', authUid)
      .maybeSingle();

    const billingMarket = getBillingMarketFromCountryCode(
      (userRow as any)?.country_code || (authData.user.user_metadata as any)?.country_code
    );

    const billingAudience = String((userRow as any)?.billing_audience || '').trim().toLowerCase();
    if (billingAudience === 'business') {
      return NextResponse.json(
        {
          error: 'Business trial starts are not available from this route. Continue via business billing.',
          code: 'BUSINESS_TRIAL_NOT_AVAILABLE',
        },
        { status: 409 }
      );
    }

    const isEmailVerified = userRow
      ? Boolean((userRow as any)?.email_verified_at)
      : Boolean((authData.user as any)?.email_confirmed_at);

    if (!isEmailVerified) {
      return NextResponse.json(
        {
          error: 'Verify your email before starting your free trial',
          code: 'EMAIL_VERIFICATION_REQUIRED',
          redirect: buildVerifyRedirect(request, planId, billingMarket),
        },
        { status: 403 }
      );
    }

    const { data: existingSubscriptions } = await supabaseAdmin
      .from('subscriptions')
      .select('id, plan_type, status, stripe_subscription_id')
      .eq('user_id', authUid)
      .order('updated_at', { ascending: false });

    const subscriptions = existingSubscriptions || [];
    const latestSubscription = subscriptions[0] || null;

    if (
      latestSubscription &&
      String(latestSubscription.status || '').toLowerCase() === 'trialing' &&
      !latestSubscription.stripe_subscription_id
    ) {
      const nowIso = new Date().toISOString();
      if ((latestSubscription.plan_type || '').trim() !== requestedPlan.name.trim()) {
        const { error: updateError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            plan_type: requestedPlan.name,
            cancel_at_period_end: false,
            updated_at: nowIso,
          })
          .eq('id', latestSubscription.id);

        if (updateError) {
          return NextResponse.json({ error: 'Unable to update your trial plan right now.' }, { status: 500 });
        }
      }

      await syncUserEntitlementSnapshot(authUid);
      invalidateUserPlanCache(authUid);
      const planData = await getUserPlanData(authUid, authData.user.email ?? null, { bypassCache: true });
      return NextResponse.json({ ok: true, planData, alreadyStarted: true });
    }

    const hasPreviousPaidPlan = subscriptions.some((row: any) => isPaidPlan(row?.plan_type || ''));
    if (hasPreviousPaidPlan) {
      return NextResponse.json(
        {
          error: 'This free trial has already been used. Continue with billing to start the plan again.',
          code: 'TRIAL_ALREADY_USED',
        },
        { status: 409 }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const trialEndIso = getSubscriptionTrialEnd(now).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        user_id: authUid,
        plan_type: requestedPlan.name,
        status: 'trialing',
        current_period_start: nowIso,
        current_period_end: trialEndIso,
        cancel_at_period_end: false,
        trial_reminder_days_sent: [],
        updated_at: nowIso,
      });

    if (insertError) {
      console.error('Start trial: failed to create local trial subscription', insertError);
      return NextResponse.json({ error: 'Unable to start your free trial right now.' }, { status: 500 });
    }

    await syncUserEntitlementSnapshot(authUid);
    invalidateUserPlanCache(authUid);

    try {
      const recipientEmail = (userRow?.email || authData.user.email || '').trim();
      if (recipientEmail) {
        const supportEmail = process.env.SUPPORT_EMAIL || 'jordan@lenjordan.tech';
        const htmlBody = renderTemplate('27-free-trial-started.html', {
          name: userRow?.name || '',
          plan_name: planDisplayName(requestedPlan.name),
          first_charge_date: formatDateLabel(trialEndIso),
          manage_url: `${getAppUrl(request)}${getAppRouteForMarket('/settings?tab=billing', billingMarket)}`,
          support_email: supportEmail,
        });

        await sendResendEmail({
          to: recipientEmail,
          subject: 'Your MyMcKenzieCS free trial has started',
          htmlBody,
          tag: 'billing-trial-started-local',
        });
      }
    } catch (emailError) {
      console.error('Start trial: failed to send trial-start email', emailError);
    }

    const planData = await getUserPlanData(authUid, authData.user.email ?? null, { bypassCache: true });
    return NextResponse.json({ ok: true, planData });
  } catch (error: any) {
    console.error('Start trial error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to start free trial' }, { status: 500 });
  }
}
