import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { getAppUrl } from '@/lib/app-url';
import { verifyBillingRecoveryOptOutToken } from '@/lib/payments/recovery-optout';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function appBaseUrl(request: NextRequest): string {
  return getAppUrl(request);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  const decoded = verifyBillingRecoveryOptOutToken(token);
  const redirectUrl = new URL('/auth/signin', appBaseUrl(request));

  if (!decoded) {
    redirectUrl.searchParams.set('billing_opt_out', 'invalid');
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const { data: existing } = await supabaseAdmin
      .from('user_preferences')
      .select('user_id')
      .eq('user_id', decoded.userId)
      .maybeSingle();

    if (existing?.user_id) {
      await supabaseAdmin
        .from('user_preferences')
        .update({ billing_recovery_opt_out: true })
        .eq('user_id', decoded.userId);
    } else {
      await supabaseAdmin
        .from('user_preferences')
        .insert({
          user_id: decoded.userId,
          email_notifications: true,
          deadline_reminders: false,
          billing_recovery_opt_out: true,
        });
    }

    redirectUrl.searchParams.set('billing_opt_out', 'success');
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Billing recovery opt-out failed', error);
    redirectUrl.searchParams.set('billing_opt_out', 'error');
    return NextResponse.redirect(redirectUrl);
  }
}
