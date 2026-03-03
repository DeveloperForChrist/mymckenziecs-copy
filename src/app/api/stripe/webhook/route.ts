import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/payments/stripe';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';
import { getAppUrl } from '@/lib/app-url';
import { isBillingActiveStripeStatus, normalizeStripeSubscriptionStatus } from '@/lib/payments/subscription-status';
import { buildLifecycleSchedule, getLifecycleArchiveDays, getLifecycleDeleteDays } from '@/lib/payments/subscription-lifecycle';
import { invalidateUserPlanCache } from '@/lib/payments/user-plan';
import fs from 'fs';
import path from 'path';
import { PLAN_PRICES } from '@/constants';
import { z } from 'zod';

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');

const stripeEventSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.unknown(),
  }),
});

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

function formatAmount(amountMinor?: number | null, currency?: string | null) {
  if (typeof amountMinor !== 'number') return '—';
  const code = (currency || 'GBP').toUpperCase();
  return `${(amountMinor / 100).toFixed(2)} ${code}`;
}

function resolvePlanNameFromPriceId(priceId?: string | null) {
  const plan = PLAN_PRICES.find((p) => p.priceId === priceId);
  return plan?.name || 'Your new plan';
}

async function getUserEmail(userId: string): Promise<{ email: string; name?: string | null } | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('email, name')
    .eq('id', userId)
    .maybeSingle();

  if (!data?.email) return null;
  return { email: data.email, name: (data as any).name ?? null };
}

async function getUserByStripeCustomerId(customerId: string | null) {
  if (!customerId) return null;
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!sub?.user_id) return null;
  return getUserEmail(sub.user_id);
}

async function markSubscriptionPastDue(customerId: string | null, graceDays: number, nextRetryAt?: Date | null) {
  if (!customerId) return;
  const now = new Date();
  const fallbackGraceEnd = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);

  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('status, past_due_since, grace_period_end, grace_day3_sent_at, grace_day6_sent_at, grace_reminder_days_sent')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  const alreadyPastDue =
    existing?.status === 'past_due' &&
    existing?.grace_period_end &&
    new Date(existing.grace_period_end) > now;

  const graceEnd = alreadyPastDue && existing?.grace_period_end
    ? new Date(existing.grace_period_end)
    : fallbackGraceEnd;

  const pastDueSince = alreadyPastDue && existing?.past_due_since
    ? new Date(existing.past_due_since)
    : now;

  const updatePayload: Record<string, any> = {
    status: 'past_due',
    past_due_since: pastDueSince.toISOString(),
    grace_period_end: graceEnd.toISOString(),
    next_retry_at: nextRetryAt ? nextRetryAt.toISOString() : null,
    updated_at: now.toISOString(),
  };

  if (!alreadyPastDue) {
    updatePayload.grace_day3_sent_at = null;
    updatePayload.grace_day6_sent_at = null;
    updatePayload.grace_reminder_days_sent = [];
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(updatePayload)
    .eq('stripe_customer_id', customerId);

  if (error) {
    console.error('Failed to mark subscription past_due', error);
  }
  return graceEnd;
}

async function markSubscriptionLapsed(customerId: string | null, status: 'cancelled' | 'expired') {
  if (!customerId) return null;
  const now = new Date();

  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select(
      'lifecycle_lapsed_at, lifecycle_archive_at, lifecycle_delete_at, lifecycle_archived_at, lifecycle_deleted_at, lifecycle_archive_notice_sent_at, lifecycle_delete_notice_sent_at, lifecycle_reminder_days_sent, lifecycle_archive_warning_days_sent, lifecycle_delete_warning_days_sent'
    )
    .eq('stripe_customer_id', customerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const alreadyScheduled = Boolean(existing?.lifecycle_lapsed_at);
  const schedule = existing?.lifecycle_lapsed_at
    ? {
        lapsedAt: new Date(existing.lifecycle_lapsed_at),
        archiveAt: existing.lifecycle_archive_at ? new Date(existing.lifecycle_archive_at) : buildLifecycleSchedule(existing.lifecycle_lapsed_at).archiveAt,
        deleteAt: existing.lifecycle_delete_at ? new Date(existing.lifecycle_delete_at) : buildLifecycleSchedule(existing.lifecycle_lapsed_at).deleteAt,
      }
    : buildLifecycleSchedule(now);

  const payload: Record<string, any> = {
    status,
    lifecycle_lapsed_at: schedule.lapsedAt.toISOString(),
    lifecycle_archive_at: schedule.archiveAt.toISOString(),
    lifecycle_delete_at: schedule.deleteAt.toISOString(),
    updated_at: now.toISOString(),
  };

  if (!alreadyScheduled) {
    payload.lifecycle_archived_at = null;
    payload.lifecycle_deleted_at = null;
    payload.lifecycle_archive_notice_sent_at = null;
    payload.lifecycle_delete_notice_sent_at = null;
    payload.lifecycle_archive_warning_days_sent = [];
    payload.lifecycle_delete_warning_days_sent = [];
    payload.lifecycle_reminder_days_sent = [];
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(payload)
    .eq('stripe_customer_id', customerId);

  if (error) {
    console.error('Failed to mark subscription lapsed', error);
  }

  return schedule;
}

async function clearSubscriptionGrace(customerId: string | null, status: 'active' | 'cancelled' | 'expired' = 'active') {
  if (!customerId) return;
  const now = new Date();
  const payload: Record<string, any> = {
    status,
    past_due_since: null,
    grace_period_end: null,
    next_retry_at: null,
    grace_day3_sent_at: null,
    grace_day6_sent_at: null,
    grace_reminder_days_sent: [],
    updated_at: now.toISOString(),
  };

  if (status === 'active') {
    payload.lifecycle_lapsed_at = null;
    payload.lifecycle_archive_at = null;
    payload.lifecycle_delete_at = null;
    payload.lifecycle_archived_at = null;
    payload.lifecycle_deleted_at = null;
    payload.lifecycle_archive_notice_sent_at = null;
    payload.lifecycle_delete_notice_sent_at = null;
    payload.lifecycle_archive_warning_days_sent = [];
    payload.lifecycle_delete_warning_days_sent = [];
    payload.lifecycle_reminder_days_sent = [];
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update(payload)
    .eq('stripe_customer_id', customerId);

  if (error) {
    console.error('Failed to clear subscription grace fields', error);
  }

}

function formatDateLabel(value?: Date | number | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatDateShort(value?: Date | number | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function daysUntilInLondon(target: Date) {
  const tz = 'Europe/London';
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(target);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  const targetDay = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00`);
  const nowParts = fmt.formatToParts(new Date());
  const getNow = (type: string) => nowParts.find((p) => p.type === type)?.value || '';
  const nowDay = new Date(`${getNow('year')}-${getNow('month')}-${getNow('day')}T00:00:00`);
  return Math.ceil((targetDay.getTime() - nowDay.getTime()) / (24 * 60 * 60 * 1000));
}

function getConfiguredGraceDays(): number {
  const parsed = Number.parseInt(process.env.BILLING_GRACE_DAYS || '', 10);
  if (!Number.isFinite(parsed)) return 7;
  return Math.max(1, Math.min(30, parsed));
}

function normalizePlanTypeFromPrice(priceId?: string | null): string {
  if (!priceId) return 'No plan';
  const match = PLAN_PRICES.find((plan) => plan.priceId === priceId);
  const name = (match?.name || '').toLowerCase();
  if (name.includes('basic') || name.includes('essential') || name.includes('premium cheap')) return 'Basic';
  if (name.includes('premium +') || name.includes('premium plus') || name.includes('plus') || name.includes('premium pro')) return 'Premium +';
  if (name.includes('premium')) return 'Premium';
  return 'No plan';
}

function displayPlanName(planType?: string | null): string {
  const raw = (planType || '').toLowerCase();
  if (raw.includes('basic') || raw.includes('essential') || raw.includes('premium cheap')) return 'Basic';
  if (raw.includes('premium +') || raw.includes('premium plus') || raw.includes('premium pro') || raw.includes('plus')) return 'Premium +';
  if (raw.includes('premium')) return 'Premium';
  if (!raw || raw.includes('free') || raw.includes('no plan')) return 'No plan';
  return planType || 'Plan';
}

async function resolveUserIdForCustomer(customerId: string | null) {
  if (!customerId) return null;
  const { data: existingSub } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  if (existingSub?.user_id) return existingSub.user_id;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    const metadataUserId = (customer as any)?.metadata?.userId || null;
    if (!metadataUserId) return null;
    const { data: userRow } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', metadataUserId)
      .maybeSingle();
    return userRow?.id || null;
  } catch (error) {
    console.error('Failed to resolve user from Stripe customer', error);
    return null;
  }
}

async function upsertSubscriptionFromStripe(subscription: any) {
  const customerId = subscription?.customer as string | null;
  const userId = await resolveUserIdForCustomer(customerId);
  if (!userId) {
    console.warn('Subscription webhook: no user found for customer', customerId);
    return;
  }

  const priceId = subscription?.items?.data?.[0]?.price?.id || null;
  const planType = normalizePlanTypeFromPrice(priceId);
  const status = normalizeStripeSubscriptionStatus(subscription?.status);
  const nowIso = new Date().toISOString();

  const currentPeriodStart = subscription?.current_period_start
    ? new Date(subscription.current_period_start * 1000).toISOString()
    : null;
  const currentPeriodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('id, plan_type, status')
    .eq('stripe_subscription_id', subscription?.id)
    .maybeSingle();

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert({
      user_id: userId,
      stripe_subscription_id: subscription?.id,
      stripe_customer_id: customerId,
      plan_type: planType,
      status,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
      ...(isBillingActiveStripeStatus(status)
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
    }, { onConflict: 'stripe_subscription_id' });

  if (error) {
    console.error('Failed to upsert subscription from Stripe', error);
    return;
  }

  invalidateUserPlanCache(userId);

  if (status === 'cancelled' || status === 'expired') {
    await markSubscriptionLapsed(customerId, status);
  }

  if (existing?.plan_type && existing.plan_type !== planType) {
    const user = await getUserEmail(userId);
    if (user) {
      const oldName = displayPlanName(existing.plan_type);
      const newName = displayPlanName(planType);
      const rank = (name: string) => {
        const n = name.toLowerCase();
        if (n.includes('premium +') || n.includes('premium plus') || n.includes('plus') || n.includes('premium pro')) return 3;
        if (n.includes('premium')) return 2;
        if (n.includes('basic') || n.includes('essential') || n.includes('premium cheap')) return 1;
        return 0;
      };
      const changeType = rank(newName) > rank(oldName) ? 'upgraded' : 'downgraded';
      const htmlBody = renderTemplate('17-plan-changed.html', {
        name: user.name || '',
        old_plan: oldName,
        new_plan: newName,
        change_type: changeType,
        manage_url: `${getAppUrl()}/settings`,
      });
      await sendResendEmail({
        to: user.email,
        subject: 'Your plan has been updated',
        htmlBody,
        tag: 'billing-plan-changed',
      });
    }
  }
}

export async function POST(request: Request) {
  const headerStore = await headers();
  const signature = headerStore.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    console.error('Missing webhook signature or STRIPE_WEBHOOK_SECRET');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error: any) {
    console.error('Stripe webhook signature verification failed', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  const parsedEvent = stripeEventSchema.safeParse(event);
  if (!parsedEvent.success) {
    console.error('Stripe webhook payload failed validation', parsedEvent.error);
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  event = parsedEvent.data;

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      const metadata = session.metadata || {};
      const userId = metadata.userId;
      const planId = metadata.planId;
      const checkoutEmail = session?.customer_details?.email || session?.customer_email || null;
      const checkoutName = session?.customer_details?.name || '';

      const user = userId ? await getUserEmail(userId) : null;
      const recipientEmail = user?.email || checkoutEmail;

      if (recipientEmail && planId) {
        const planName = resolvePlanNameFromPriceId(planId);
        const invoicePdfUrl =
          (session?.invoice && typeof session.invoice === 'object' ? session.invoice.invoice_pdf : null) ||
          `${getAppUrl(request)}/settings`;
        const htmlBody = renderTemplate('04-plan-upgrade-receipt.html', {
          name: user?.name || checkoutName || recipientEmail,
          txn_id: String(session?.payment_intent || session?.id || '—'),
          amount: formatAmount(session?.amount_total, session?.currency),
          new_plan: planName,
          invoice_pdf_url: String(invoicePdfUrl),
        });
        await sendResendEmail({
          to: recipientEmail,
          subject: 'Your MyMcKenzieCS plan is being activated',
          htmlBody,
          tag: 'billing-plan-upgrade',
        });
      } else {
        console.warn('Checkout session missing recipient email or planId, skipping upgrade email', {
          hasUserId: Boolean(userId),
          hasCheckoutEmail: Boolean(checkoutEmail),
          hasPlanId: Boolean(planId),
        });
      }

      // Keep plan state in sync even if subscription.created/updated webhooks are
      // not configured or delayed.
      if (session?.subscription) {
        try {
          const subscription = await stripe.subscriptions.retrieve(String(session.subscription));
          await upsertSubscriptionFromStripe(subscription);
          await clearSubscriptionGrace(session.customer as string | null, 'active');
        } catch (syncError) {
          console.error('Failed to sync subscription on checkout completion', syncError);
        }
      }
    } else if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as any;
      await upsertSubscriptionFromStripe(subscription);
    } else if (event.type === 'invoice.upcoming') {
      const invoice = event.data.object as any;
      const customerId = invoice?.customer as string | null;
      const user = await getUserByStripeCustomerId(customerId);
      if (!user) {
        return NextResponse.json({ received: true });
      }

      const nextAttemptTs = invoice?.next_payment_attempt ? invoice.next_payment_attempt * 1000 : null;
      const nextAttemptDate = nextAttemptTs ? new Date(nextAttemptTs) : null;
      if (!nextAttemptDate) {
        return NextResponse.json({ received: true });
      }

      const daysLeft = daysUntilInLondon(nextAttemptDate);
      if (daysLeft !== 3) {
        return NextResponse.json({ received: true });
      }

      const priceId = invoice?.lines?.data?.[0]?.price?.id || null;
      const planType = normalizePlanTypeFromPrice(priceId);
      const planName = displayPlanName(planType);
      const renewalDate = formatDateShort(nextAttemptDate) || 'soon';
      const manageUrl = `${getAppUrl()}/settings`;

      const htmlBody = renderTemplate('05-subscription-renewal-reminder.html', {
        name: user.name || '',
        plan_name: planName,
        renewal_date: renewalDate,
        manage_url: manageUrl,
        days_left: String(daysLeft),
      });

      await sendResendEmail({
        to: user.email,
        subject: 'Your plan renews in 3 days',
        htmlBody,
        tag: 'billing-renewal-reminder',
      });
    } else if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as any;
      const graceDays = getConfiguredGraceDays();
      const nextRetryAt = invoice?.next_payment_attempt ? new Date(invoice.next_payment_attempt * 1000) : null;
      const graceEnd = await markSubscriptionPastDue(invoice.customer as string | null, graceDays, nextRetryAt);
      const nextRetryLabel = formatDateLabel(nextRetryAt);
      const graceEndLabel = formatDateLabel(graceEnd || null);
      const user = await getUserByStripeCustomerId(invoice.customer as string | null);

      if (user) {
        const manageUrl = process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/settings`
          : 'http://localhost:3000/settings';
        const invoiceId = invoice?.number || invoice?.id || '—';
        const retryUrl = invoice?.hosted_invoice_url || manageUrl;
        const invoiceUrl = invoice?.hosted_invoice_url || manageUrl;
        const htmlBody = renderTemplate('06-payment-failed.html', {
          name: user.name || '',
          invoice_id: String(invoiceId),
          retry_url: String(retryUrl),
          invoice_url: String(invoiceUrl),
          grace_days: String(graceDays),
          next_retry_date: nextRetryLabel || 'soon',
          grace_end_date: graceEndLabel || `${graceDays} days from now`,
        });
        await sendResendEmail({
          from: process.env.RESEND_ALERT_FROM_EMAIL || 'alerts@mymckenziecs.com',
          to: user.email,
          subject: 'Payment failed — action required',
          htmlBody,
          tag: 'billing-payment-failed',
        });
      }
    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;
      await clearSubscriptionGrace(invoice.customer as string | null, 'active');
      if (invoice?.subscription) {
        try {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await upsertSubscriptionFromStripe(subscription);
        } catch (error) {
          console.error('Failed to refresh subscription after payment', error);
        }
      }

      const billingReason = invoice?.billing_reason;
      if (billingReason === 'subscription_cycle') {
        const user = await getUserByStripeCustomerId(invoice.customer as string | null);
        if (user) {
          await sendResendEmail({
            to: user.email,
            subject: 'Your subscription has renewed',
            htmlBody: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4c1d95;">Subscription renewed</h2>
                <p>Hi${user.name ? ` ${user.name}` : ''},</p>
                <p>Your subscription has renewed successfully. Thank you for staying with us.</p>
                <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">MyMcKenzieCS</p>
              </div>
            `,
            tag: 'billing-renewal-confirmed',
          });
        }
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      const lapsedSchedule = await markSubscriptionLapsed(subscription.customer as string | null, 'cancelled');
      try {
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'cancelled',
            cancel_at_period_end: false,
            updated_at: nowIso,
          })
          .eq('stripe_subscription_id', subscription.id);
      } catch (error) {
        console.error('Failed to mark subscription cancelled', error);
      }
      const user = await getUserByStripeCustomerId(subscription.customer as string | null);

      if (user) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const archiveDate = formatDateShort(lapsedSchedule?.archiveAt || null) || 'soon';
        const deleteDate = formatDateShort(lapsedSchedule?.deleteAt || null) || 'soon';
        const htmlBody = renderTemplate('13-cancellation-confirmation.html', {
          cancel_date: formatDateShort(new Date()) || 'today',
          retention_days: String(getLifecycleArchiveDays()),
          delete_days: String(getLifecycleDeleteDays()),
          archive_date: archiveDate,
          delete_date: deleteDate,
          reactivate_url: `${appUrl}/pricing`,
          policy_url: `${appUrl}/privacy-policy`,
        });
        await sendResendEmail({
          to: user.email,
          subject: 'Your subscription has been canceled',
          htmlBody,
          tag: 'billing-subscription-canceled',
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handling failed', error);
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }
}
