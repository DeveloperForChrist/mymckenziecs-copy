import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { getAppUrl } from '@/lib/app-url'
import { renderPlainEmail } from '@/lib/email/plain-template'
import { sendResendEmail, type ResendEmailAttachment } from '@/lib/email/resend'
import { EMAIL_ATTACHMENT_LABEL, isAllowedEmailAttachment } from '@/lib/inbox/attachment-policy'
import { htmlEscape } from '@/lib/utils/html-escape'
import nodemailer from 'nodemailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type SendEmailPayload = {
  to: string
  subject: string
  body: string
  attachmentIds?: string[]
}

type StoredAttachment = {
  documentId: string
  name: string
  mimeType: string | null
  size: number | null
}

type DirectEmailAttachment = StoredAttachment & {
  content: Buffer
}

const MAX_DIRECT_EMAIL_ATTACHMENT_BYTES = 15 * 1024 * 1024

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function renderMessageBodyHtml(body: string) {
  return body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;">${htmlEscape(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

function buildAttachmentsHtml(attachments: StoredAttachment[]) {
  if (!attachments.length) return ''

  return `
    <div style="margin:0 0 20px;">
      <p style="margin:0 0 10px;font-size:15px;color:#334155;"><strong>Attachments included with this email</strong></p>
      <ul style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.7;">
        ${attachments.map((attachment) => `<li>${htmlEscape(attachment.name)}</li>`).join('')}
      </ul>
    </div>
  `
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const accessToken = authHeader.replace('Bearer ', '').trim()
    if (!accessToken) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
    const user = authData?.user
    if (authError || !user?.email) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }
    const senderEmail = normalizeEmail(user.email)

    const payload = (await request.json()) as SendEmailPayload
    const to = normalizeEmail(payload?.to)
    const subject = asString(payload?.subject)
    const body = asString(payload?.body)
    if (!to || !subject || !body) {
      return NextResponse.json({ message: 'Recipient, subject, and message are required.' }, { status: 400 })
    }

    const attachmentIds = Array.from(
      new Set(
        Array.isArray(payload?.attachmentIds)
          ? payload.attachmentIds.map((id) => asString(id)).filter(Boolean)
          : [],
      ),
    )

    const attachments =
      attachmentIds.length > 0
        ? await (async () => {
            const { data: docs, error: docsError } = await supabaseAdmin
              .from('documents')
              .select('id, name, storage_path, mime_type, file_size, uploaded_by, deleted_at')
              .in('id', attachmentIds)
              .eq('uploaded_by', user.id)
              .is('deleted_at', null)

            if (docsError) {
              throw docsError
            }

            const foundDocs = Array.isArray(docs) ? docs : []
            if (foundDocs.length !== attachmentIds.length) {
              throw new Error('One or more attachments could not be found.')
            }

            const invalidAttachment = foundDocs.find(
              (doc) => !isAllowedEmailAttachment({ name: String(doc.name || ''), mimeType: doc.mime_type || null }),
            )
            if (invalidAttachment) {
              throw new Error(`Only ${EMAIL_ATTACHMENT_LABEL} can be sent as inbox attachments.`)
            }

            const downloadedDocs = await Promise.all(
              foundDocs.map(async (doc) => {
                const storagePath = asString(doc.storage_path)
                if (!storagePath) {
                  throw new Error(`Attachment "${String(doc.name || 'Document')}" is missing its storage path.`)
                }

                const { data: fileData, error: downloadError } = await supabaseAdmin
                  .storage
                  .from('user-uploads')
                  .download(storagePath)

                if (downloadError || !fileData) {
                  throw new Error(`Failed to download attachment "${String(doc.name || 'Document')}".`)
                }

                const content = Buffer.from(await fileData.arrayBuffer())
                return {
                  documentId: String(doc.id),
                  name: String(doc.name || 'Document'),
                  mimeType: doc.mime_type || null,
                  size: typeof doc.file_size === 'number' ? doc.file_size : content.byteLength,
                  content,
                } satisfies DirectEmailAttachment
              }),
            )

            const totalAttachmentBytes = downloadedDocs.reduce((sum, doc) => sum + doc.content.byteLength, 0)
            if (totalAttachmentBytes > MAX_DIRECT_EMAIL_ATTACHMENT_BYTES) {
              throw new Error('Attachments are too large to send by email. Please keep the total below 15 MB.')
            }

            return downloadedDocs
          })()
        : []

    const senderName =
      asString(user.user_metadata?.full_name) ||
      asString(user.user_metadata?.display_name) ||
      user.email.split('@')[0] ||
      'MyMcKenzieCS Professional'
    const appUrl = getAppUrl(request)
    const inboxUrl = `${appUrl}/client-portal`
    const attachmentSummary = attachments.length > 0 ? `${attachments.length} attachment${attachments.length === 1 ? '' : 's'} included.` : 'No attachments.'
    const textBody = [
      'Hello,',
      '',
      `${senderName} has sent you a message from their MyMcKenzieCS workspace.`,
      '',
      body,
      '',
      `Subject: ${subject}`,
      `Attachments: ${attachmentSummary}`,
      '',
      `You can also view this message securely in your client portal: ${inboxUrl}`,
      '',
      `Kind regards,`,
      senderName,
    ].join('\n')

    const htmlBody = renderPlainEmail({
      preheader: `${senderName} has sent you a message.`,
      title: subject,
      greeting: 'Hello,',
      intro: `${senderName} has sent you a message from their MyMcKenzieCS workspace.`,
      detailsTitle: 'Message details',
      details: [
        { label: 'From', value: senderName },
        { label: 'Subject', value: subject },
        { label: 'Attachments', value: attachmentSummary },
      ],
      bodyHtml: `${renderMessageBodyHtml(body)}${buildAttachmentsHtml(attachments)}`,
      ctaLabel: 'Open client portal',
      ctaUrl: inboxUrl,
      note: attachments.length > 0
        ? 'The listed attachments are included with this email and are also available in your client portal.'
        : 'A copy of this message is also available in your client portal.',
      closing: `Kind regards,\n${senderName}`,
    })

    const emailAttachments: ResendEmailAttachment[] = attachments.map((attachment) => ({
      filename: attachment.name,
      content: attachment.content,
      contentType: attachment.mimeType || undefined,
    }))

    const canUseResend = Boolean(process.env.RESEND_API_KEY)
    const gmailUser = process.env.GMAIL_USER
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
    const replyTo = user.email
    let messageSent = false

    if (canUseResend) {
      try {
        await sendResendEmail({
          to,
          subject,
          textBody,
          htmlBody,
          tag: 'business-direct-email',
          from: process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL,
          replyTo,
          attachments: emailAttachments,
        })
        messageSent = true
      } catch (resendError) {
        if (!gmailUser || !gmailAppPassword) {
          throw resendError
        }
      }
    }

    if (!messageSent && gmailUser && gmailAppPassword) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        auth: { user: gmailUser, pass: gmailAppPassword },
      })

      await transporter.sendMail({
        from: gmailUser,
        to,
        replyTo,
        subject,
        text: textBody,
        html: htmlBody,
        attachments: emailAttachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.content,
          contentType: attachment.contentType,
        })),
      })
      messageSent = true
    }

    if (!messageSent) {
      return NextResponse.json({ message: 'Email sending is not configured.' }, { status: 500 })
    }

    const storedAttachments: StoredAttachment[] = attachments.map(({ content: _content, ...attachment }) => attachment)
    const { error: insertError } = await supabaseAdmin
      .from('inbox_messages')
      .insert({
        sender_id: user.id,
        sender_email: senderEmail,
        sender_name: senderName,
        recipient_email: to,
        subject,
        content: body,
        type: 'email',
        metadata: {
          channel: 'direct_email',
          direction: 'outbound',
          sentByBusinessDashboard: true,
          deliveredToEmail: true,
          mirroredToClientPortal: true,
          attachmentIds,
          attachments: storedAttachments,
        },
      })

    if (insertError) {
      console.error('Failed to save platform message record:', insertError)
      return NextResponse.json({ message: 'Email sent successfully, but the portal copy could not be saved.' })
    }

    return NextResponse.json({ message: 'Email sent successfully and mirrored to the client portal.' })
  } catch (error) {
    console.error('Business send email error:', error)
    const message = error instanceof Error ? error.message : 'Failed to send message.'
    return NextResponse.json({ message }, { status: 500 })
  }
}
