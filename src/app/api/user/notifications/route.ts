import { NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { stripe } from '@/lib/payments/stripe';

type NotificationLevel = 'info' | 'success' | 'warning' | 'critical';
type NotificationItem = {
  id: string;
  level: NotificationLevel;
  title: string;
  detail: string;
  actionLabel?: string;
  actionType?: 'resend_verification' | 'open_href';
  href?: string;
  email?: string;
};

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const ms = date.getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function capitalize(value: string) {
  if (!value) return value;
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = authData.user.id;
    const authEmail = authData.user.email || '';

    const notifications: NotificationItem[] = [];

    const { data: userRow, error: userError } = await supabaseAdmin
      .from('users')
      .select('email, email_verified_at')
      .eq('id', userId)
      .maybeSingle();

    if (userError) {
      console.error('Notifications users lookup failed:', userError);
      return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
    }

    const effectiveEmail = userRow?.email || authEmail;

    if (!userRow?.email_verified_at) {
      notifications.push({
        id: 'email-unverified',
        level: 'warning',
        title: 'Verify your account email',
        detail: 'Please verify your email to keep account recovery and security options available.',
        actionLabel: 'Resend verification link',
        actionType: 'resend_verification',
        email: effectiveEmail,
      });
    } else {
      notifications.push({
        id: 'email-verified',
        level: 'success',
        title: 'Account verified',
        detail: `Email verified on ${formatDate(userRow.email_verified_at)}.`,
      });
    }

    const { data: latestSub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select(
        'plan_type, status, current_period_end, grace_period_end, next_retry_at, updated_at, stripe_customer_id, lifecycle_archive_at, lifecycle_delete_at'
      )
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) {
      console.error('Notifications subscription lookup failed:', subError);
      return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
    }

    if (latestSub) {
      const status = String(latestSub.status || '').toLowerCase();
      const planName = String(latestSub.plan_type || 'plan');
      const renewalDays = daysUntil(latestSub.current_period_end);
      const graceEnd = formatDate(latestSub.grace_period_end);
      const retryDate = formatDate(latestSub.next_retry_at);
      const archiveDate = formatDate(latestSub.lifecycle_archive_at);
      const deleteDate = formatDate(latestSub.lifecycle_delete_at);

      if (status === 'past_due') {
        notifications.push({
          id: 'billing-past-due',
          level: 'critical',
          title: 'Payment failed - action required',
          detail: `Your ${planName} plan is past due${graceEnd ? ` until ${graceEnd}` : ''}${retryDate ? `. Next retry: ${retryDate}.` : '.'} Your documents remain safe during this period.`,
          href: '/settings',
        });
      } else if (status === 'expired' || status === 'cancelled') {
        notifications.push({
          id: 'billing-lapsed',
          level: 'critical',
          title: status === 'cancelled' ? 'Subscription cancelled' : 'Subscription access paused',
          detail: `Your ${planName} paid access is not active. Dashboard is read-only until you resume. Your documents stay safe${archiveDate ? ` until hard lock on ${archiveDate}` : ''}${deleteDate ? ` and scheduled deletion on ${deleteDate}` : ''}.`,
          href: '/pricing',
          actionLabel: 'Resume plan',
          actionType: 'open_href',
        });
      } else if (status === 'active' && renewalDays !== null && renewalDays >= 0 && renewalDays <= 5) {
        notifications.push({
          id: 'billing-due-soon',
          level: 'warning',
          title: 'Payment due soon',
          detail: `Your ${planName} renewal is due in ${renewalDays} day${renewalDays === 1 ? '' : 's'}.`,
          href: '/settings',
        });
      } else if (status === 'active') {
        notifications.push({
          id: 'billing-active',
          level: 'info',
          title: `${planName} plan active`,
          detail: latestSub.current_period_end
            ? `Next renewal date: ${formatDate(latestSub.current_period_end)}.`
            : 'Your billing is active.',
          href: '/settings',
        });
      } else {
        notifications.push({
          id: 'billing-status',
          level: 'info',
          title: 'Billing status updated',
          detail: `Current status: ${capitalize(status || 'unknown')}.`,
          href: '/settings',
        });
      }

      if (latestSub.stripe_customer_id) {
        try {
          const customer = await stripe.customers.retrieve(latestSub.stripe_customer_id, {
            expand: ['invoice_settings.default_payment_method'],
          });

          let paymentMethod: any = (customer as any)?.invoice_settings?.default_payment_method || null;
          if (!paymentMethod) {
            const list = await stripe.paymentMethods.list({
              customer: latestSub.stripe_customer_id,
              type: 'card',
              limit: 1,
            });
            paymentMethod = list?.data?.[0] || null;
          }

          if (paymentMethod && paymentMethod.type === 'card') {
            const card = paymentMethod.card || {};
            const createdTs = Number(paymentMethod.created || 0);
            const oneDayMs = 24 * 60 * 60 * 1000;
            const changedRecently = createdTs > 0 && Date.now() - (createdTs * 1000) <= (3 * oneDayMs);

            if (changedRecently) {
              const brand = capitalize(card.brand || 'Card');
              const masked = card.last4 ? ` ending ${card.last4}` : '';
              notifications.push({
                id: `payment-method-updated-${paymentMethod.id || createdTs}`,
                level: 'info',
                title: 'Payment method updated',
                detail: `${brand}${masked} was added to your billing profile recently.`,
                href: '/settings',
              });
            }
          }
        } catch (stripeError) {
          console.error('Notifications payment method lookup failed:', stripeError);
        }
      }
    }

    return NextResponse.json({ notifications });
  } catch (error: any) {
    console.error('Notifications API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
