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
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; line-height: 1.6; color: #111827;">
      <p style="margin:0 0 14px;">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 14px;">You have received a new secure message from <strong>${escapeHtml(params.senderName)}</strong> on MyMcKenzieCS.</p>
      <p style="margin:0 0 10px;"><strong>Subject:</strong> ${escapeHtml(params.subjectLine)}</p>
      ${preview ? `<p style="margin:0 0 14px;"><strong>Preview:</strong> ${escapeHtml(preview)}</p>` : ''}
      <p style="margin:0 0 14px;">Please sign in to MyMcKenzieCS to read and reply securely:</p>
      <p style="margin:0 0 16px;">
        <a href="${inboxUrl}" style="display:inline-block;background:#270427;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;border:1px solid #1c1a42;">Open My Messages</a>
      </p>
      <p style="margin:0;color:#6b7280;font-size:13px;">This notification email does not include the full message content for privacy and security.</p>
      <p style="margin:16px 0 0;">Kind regards,<br />MyMcKenzieCS</p>
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
