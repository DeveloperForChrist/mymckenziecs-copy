import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { sendResendEmail } from '@/lib/email/resend';
import { supabaseAdmin } from '@/lib/database/supabase-server';
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
    const supabase = await createSupabaseRouteClient();
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = data.user!;
    const email = user.email as string;
    const name =
      user.user_metadata?.full_name ||
      user.user_metadata?.display_name ||
      user.email?.split('@')[0] ||
      'there';

    if (!user.email_confirmed_at) {
      return NextResponse.json({ error: 'Email not verified' }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const nowIso = new Date().toISOString();

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ welcome_email_sent_at: nowIso, email, name })
      .eq('id', user.id)
      .is('welcome_email_sent_at', null)
      .select('id');

    if (updateError) {
      throw updateError;
    }

    let claimed = (updatedRows?.length || 0) > 0;

    if (!claimed) {
      const { error: insertError } = await supabaseAdmin.from('users').insert({
        id: user.id,
        email,
        name,
        welcome_email_sent_at: nowIso,
      });

      if (!insertError) {
        claimed = true;
      } else {
        const { data: existing, error: existingError } = await supabaseAdmin
          .from('users')
          .select('id, welcome_email_sent_at')
          .eq('id', user.id)
          .maybeSingle();

        if (existingError) {
          throw existingError;
        }

        if (existing?.welcome_email_sent_at) {
          return NextResponse.json({ success: true, skipped: true });
        }
      }
    }

    if (!claimed) {
      return NextResponse.json({ success: true, skipped: true });
    }

    const htmlBody = renderTemplate('01-welcome.html', {
      name,
      cta_url: `${appUrl}/dashboard`,
    });

    try {
      await sendResendEmail({
        to: email,
        subject: 'Welcome to MymckenzieCS',
        htmlBody,
        tag: 'welcome-signup',
      });
    } catch (sendError) {
      await supabaseAdmin
        .from('users')
        .update({ welcome_email_sent_at: null })
        .eq('id', user.id)
        .eq('welcome_email_sent_at', nowIso);
      throw sendError;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Welcome email failed', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send welcome email' },
      { status: 500 }
    );
  }
}
