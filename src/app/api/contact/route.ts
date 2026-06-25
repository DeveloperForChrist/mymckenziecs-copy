import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient } from '@/lib/database/supabase-route';
import nodemailer from 'nodemailer';
import { sendResendEmail } from '@/lib/email/resend';
import { getOrSyncUserEntitlementSnapshot } from '@/lib/payments/entitlements';
import { isPremiumPlusPlan, planDisplayName } from '@/lib/plans/access';
import { emailDailyRateLimiter, emailRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit';
import { htmlEscape } from '@/lib/utils/html-escape';
import { renderPlainEmail } from '@/lib/email/plain-template';

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
    const userEmail = String(email || '');
    let userName = String(email.split('@')[0] || '');
    let planLabel = 'No plan';
    
    try {
      const supabase = await createSupabaseRouteClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.email) {
        userName = user.user_metadata?.full_name || user.email.split('@')[0];
      }
      if (user?.id) {
        const snapshot = await getOrSyncUserEntitlementSnapshot(user.id);
        if (snapshot?.plan_type) {
          planLabel = snapshot.plan_type.toString();
        }
      }
    } catch (_error) {
      console.log('User not authenticated, using form email');
    }

    const supportEmail = process.env.SUPPORT_EMAIL || 'jordan@lenjordan.tech';
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    const premiumPlus = isPremiumPlusPlan(planLabel);
    const normalizedPlanLabel = planDisplayName(planLabel);
    const subjectPrefix = premiumPlus ? '[PRIORITY][Premium +]' : `[${normalizedPlanLabel}]`;
    const safeUserName = htmlEscape(userName)
    const safeUserEmail = htmlEscape(userEmail)
    const safeSubject = htmlEscape(subject)
    const safeMessage = htmlEscape(message)

    const subjectLine = `${subjectPrefix} ${safeSubject} - ${safeUserName}`;
    const textBody = `
Contact Form Submission

From: ${safeUserName}
Email: ${safeUserEmail}
Plan: ${planLabel}
Subject: ${safeSubject}

Message:
${safeMessage}

---
Sent from MyMcKenzieCS Contact Form
      `;
    const htmlBody = renderPlainEmail({
      preheader: `${safeUserName} submitted a support message from MyMcKenzieCS.`,
      title: 'New contact form submission',
      greeting: 'Hello MyMcKenzieCS support,',
      intro: 'A user has submitted a contact form message from the platform.',
      detailsTitle: 'Submission details',
      details: [
        { label: 'From', value: userName },
        { label: 'Email', value: userEmail },
        { label: 'Plan', value: planLabel },
        { label: 'Subject', value: subject },
      ],
      bodyHtml: `<p style="margin:0 0 8px;font-weight:700;color:#17202a;">Message</p><p style="margin:0;white-space:pre-wrap;">${safeMessage}</p>`,
      note: 'This message was sent from the MyMcKenzieCS contact form.',
      closing: 'MyMcKenzieCS platform notification',
    });

    const priorityHeaders = {
      'X-Plan': normalizedPlanLabel,
      'X-Priority': premiumPlus ? '1 (Highest)' : '3 (Normal)',
      Importance: premiumPlus ? 'High' : 'Normal',
      Priority: premiumPlus ? 'urgent' : 'normal',
    };

    const canUseResend = Boolean(process.env.RESEND_API_KEY);
    let messageSent = false;

    if (canUseResend) {
      try {
        await sendResendEmail({
          to: supportEmail,
          subject: subjectLine,
          textBody,
          htmlBody,
          tag: 'contact',
          from: process.env.RESEND_ALERT_FROM_EMAIL || process.env.RESEND_FROM_EMAIL,
        });
        messageSent = true;
      } catch (resendError) {
        if (!gmailUser || !gmailAppPassword) {
          throw resendError;
        }
      }
    }

    if (!messageSent && gmailUser && gmailAppPassword) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: {
          user: gmailUser,
          pass: gmailAppPassword,
        },
      });

      await transporter.sendMail({
        from: gmailUser,
        to: supportEmail || gmailUser,
        replyTo: userEmail,
        subject: subjectLine,
        text: textBody,
        html: htmlBody,
        headers: priorityHeaders,
      });
      messageSent = true;
    } else if (!messageSent && !canUseResend) {
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
