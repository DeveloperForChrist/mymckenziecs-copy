import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';
import { emailDailyRateLimiter, emailRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit';
import fs from 'fs';
import path from 'path';

const TEMPLATE_DIR = path.join(process.cwd(), 'src', 'emails', 'templates');

function renderTemplate(templateName: string, vars: Record<string, string>) {
  const templatePath = path.join(TEMPLATE_DIR, templateName);
  let html = fs.readFileSync(templatePath, 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    html = html.split(`{{${k}}}`).join(v);
  }
  return html;
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    const ipIdentifier = `email:reset:ip:${getIdentifier(undefined, ip)}`;
    const ipLimit = await rateLimit(emailRateLimiter, ipIdentifier, 3, 10 * 60 * 1000);
    if (!ipLimit.success) {
      return rateLimitExceededResponse(ipLimit, 'Too many reset requests. Please try again shortly.');
    }

    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const accountDailyIdentifier = `email:reset:account:${email}`;
    const accountDailyLimit = await rateLimit(emailDailyRateLimiter, accountDailyIdentifier, 5, 24 * 60 * 60 * 1000);
    if (!accountDailyLimit.success) {
      return rateLimitExceededResponse(accountDailyLimit, 'Too many reset attempts for this account. Try again later.');
    }

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (request.headers.get('origin') || '').replace(/\/$/, '') ||
      'http://localhost:3000';
    const redirectTo = `${appUrl}/auth/reset-password`;

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });

    // Don't leak whether account exists.
    if (error || !data?.properties?.action_link) {
      console.warn('Password reset generateLink skipped', error?.message || 'no-action-link');
      return NextResponse.json({ success: true });
    }

    const nameGuess = email.split('@')[0] || 'there';
    const htmlBody = renderTemplate('03-password-reset.html', {
      name: nameGuess,
      reset_url: data.properties.action_link,
      expiry_minutes: '60',
    });

    await sendResendEmail({
      to: email,
      subject: 'Reset your MymckenzieCS password',
      htmlBody,
      tag: 'password-reset',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Password reset email failed', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send password reset email' },
      { status: 500 }
    );
  }
}
