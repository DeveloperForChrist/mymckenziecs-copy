import { sendResendEmail } from '@/lib/email/resend'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export async function sendPlatformMessageNotification(params: {
  to: string
  recipientName?: string | null
  senderName: string
  subjectLine: string
  preview?: string | null
  inboxUrl?: string
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const inboxUrl = params.inboxUrl || `${appUrl}/client-portal`
  const preview = String(params.preview || '').trim()
  const greeting = params.recipientName ? `Hello ${params.recipientName},` : 'Hello,'
  const subject = `New secure message from ${params.senderName} on MyMcKenzieCS`

  const textBody = [
    greeting,
    '',
    `You have received a new secure message from ${params.senderName} on MyMcKenzieCS.`,
    `Subject: ${params.subjectLine}`,
    ...(preview ? ['', `Preview: ${preview}`] : []),
    '',
    'Please sign in to MyMcKenzieCS to read and reply securely:',
    inboxUrl,
    '',
    'This notification email does not include the full message content for privacy and security.',
    '',
    'Kind regards,',
    'MyMcKenzieCS',
  ].join('\n')

  const htmlBody = `
    <div style="max-width:640px;margin:0 auto;padding:20px 0;font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#102033;">
      <div style="background:#0f1b2d;color:#fff;border-radius:18px 18px 0 0;padding:22px 24px;">
        <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9fb2d8;font-weight:700;">MyMcKenzieCS</div>
        <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;">New secure message</h1>
      </div>
      <div style="background:#ffffff;border:1px solid #dde6f2;border-top:0;border-radius:0 0 18px 18px;padding:26px 24px 28px;box-shadow:0 12px 40px rgba(16,32,51,.08);">
        <p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>
        <p style="margin:0 0 14px;">You have received a new secure message from <strong>${escapeHtml(params.senderName)}</strong> on MyMcKenzieCS.</p>
        <div style="background:#f8fbff;border:1px solid #d7e3f4;border-radius:14px;padding:16px 18px;margin:0 0 18px;">
          <p style="margin:0 0 6px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:700;">Message summary</p>
          <p style="margin:0 0 8px;"><strong>Subject:</strong> ${escapeHtml(params.subjectLine)}</p>
          ${preview ? `<p style="margin:0;"><strong>Preview:</strong> ${escapeHtml(preview)}</p>` : ''}
        </div>
        <p style="margin:0 0 14px;">Please sign in to MyMcKenzieCS to read and reply securely:</p>
        <p style="margin:0 0 16px;">
          <a href="${inboxUrl}" style="display:inline-block;background:#1f3c73;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:12px;font-weight:700;border:1px solid #16315e;">Open My Messages</a>
        </p>
        <p style="margin:0;color:#64748b;font-size:13px;">This notification email does not include the full message content for privacy and security.</p>
        <p style="margin:16px 0 0;">Kind regards,<br />MyMcKenzieCS</p>
      </div>
    </div>
  `

  await sendResendEmail({
    to: params.to,
    subject,
    textBody,
    htmlBody,
    tag: 'platform-message-notification',
    from: process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL,
  })
}
