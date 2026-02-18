import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import { supabaseAdmin } from '@/lib/database/supabase-server';
import nodemailer from 'nodemailer';
import { emailDailyRateLimiter, emailRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req.headers);
    const ipIdentifier = `contact:ip:${getIdentifier(undefined, ip)}`;
    const ipLimit = await rateLimit(emailRateLimiter, ipIdentifier, 3, 10 * 60 * 1000);
    if (!ipLimit.success) {
      return rateLimitExceededResponse(ipLimit, 'Too many contact requests. Please try again later.');
    }

    const { email, subject, message } = await req.json();

    if (!email || !subject || !message?.trim()) {
      return NextResponse.json(
        { error: 'Email, subject and message are required' },
        { status: 400 }
      );
    }

    const accountDailyIdentifier = `contact:account:${String(email).trim().toLowerCase()}`;
    const accountDailyLimit = await rateLimit(emailDailyRateLimiter, accountDailyIdentifier, 10, 24 * 60 * 60 * 1000);
    if (!accountDailyLimit.success) {
      return rateLimitExceededResponse(accountDailyLimit, 'Contact message limit reached for today. Please try again tomorrow.');
    }

    // Use email from form, or try to get from auth
    const userEmail = email;
    let userName = email.split('@')[0];
    let planLabel = 'Free';
    
    try {
      const supabase = await createSupabaseRouteClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.email) {
        userName = user.user_metadata?.full_name || user.email.split('@')[0];
      }
      if (user?.id) {
        const { data: activeSub } = await supabaseAdmin
          .from('subscriptions')
          .select('plan_type, status')
          .eq('user_id', user.id)
          .in('status', ['active', 'past_due'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeSub?.plan_type) {
          planLabel = activeSub.plan_type.toString();
        }
      }
    } catch (error) {
      console.log('User not authenticated, using form email');
    }

    const supportEmail = process.env.SUPPORT_EMAIL || 'support@mymckenziecs.com';
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    const subjectLine = `[${planLabel}] ${subject} - ${userName}`;
    const textBody = `
Contact Form Submission

From: ${userName}
Email: ${userEmail}
Plan: ${planLabel}
Subject: ${subject}

Message:
${message}

---
Sent from MyMcKenzie Contact Form
      `;
    const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4c1d95;">New Contact Form Submission</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>From:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${userName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Email:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${userEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Plan:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${planLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Subject:</strong></td>
              <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${subject}</td>
            </tr>
          </table>
          <div style="margin-top: 20px; padding: 20px; background: #f9fafb; border-radius: 8px;">
            <h3 style="margin-top: 0;">Message:</h3>
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
            Sent from MyMcKenzie Contact Form
          </p>
        </div>
      `;

    if (gmailUser && gmailAppPassword) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailAppPassword,
        },
      });

      const isPlusPlan = /plus|premium\s*pro|premium\s*cheap/i.test(planLabel);
      const priorityHeaders = {
        'X-Plan': planLabel,
        'X-Priority': isPlusPlan ? 'High' : 'Normal',
      };

      await transporter.sendMail({
        from: gmailUser,
        to: supportEmail || gmailUser,
        replyTo: userEmail,
        subject: subjectLine,
        text: textBody,
        html: htmlBody,
        headers: priorityHeaders,
      });
    } else {
      return NextResponse.json(
        { error: 'Email service is not configured. Please try again later.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Message sent successfully' },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Contact form error:', error);
    return NextResponse.json(
      { error: 'Failed to send message. Please try again later.' },
      { status: 500 }
    );
  }
}
