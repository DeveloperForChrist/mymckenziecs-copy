import { sendResendEmail } from '@/lib/email/resend'
import { renderPlainEmail } from '@/lib/email/plain-template'

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

  const htmlBody = renderPlainEmail({
    preheader: `New secure message from ${params.senderName}.`,
    title: 'New secure message',
    greeting,
    intro: `You have received a new secure message from ${params.senderName} on MyMcKenzieCS.`,
    detailsTitle: 'Message summary',
    details: [
      { label: 'Subject', value: params.subjectLine },
      ...(preview ? [{ label: 'Preview', value: preview }] : []),
    ],
    ctaLabel: 'Open My Messages',
    ctaUrl: inboxUrl,
    note: 'This notification email does not include the full message content for privacy and security.',
    closing: 'Kind regards,\nMyMcKenzieCS',
  })

  await sendResendEmail({
    to: params.to,
    subject,
    textBody,
    htmlBody,
    tag: 'platform-message-notification',
    from: process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL,
  })
}
