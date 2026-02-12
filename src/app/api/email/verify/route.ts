import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import { sendResendEmail } from '@/lib/email/resend';
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${appUrl}/auth/verify-email`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      return NextResponse.json(
        { error: 'Unable to generate verification link' },
        { status: 500 }
      );
    }

    const verifyUrl = linkData.properties.action_link;
    const htmlBody = renderTemplate('02-email-verification.html', {
      name,
      verify_url: verifyUrl,
    });

    await sendResendEmail({
      to: email,
      subject: 'MymckenzieCS verify your email',
      htmlBody,
      tag: 'email-verification',
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Verify email failed', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to send verification email' },
      { status: 500 }
    );
  }
}
