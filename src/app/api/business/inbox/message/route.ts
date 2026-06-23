import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'
import { sendPlatformMessageNotification } from '@/lib/email/platform-notifications'
import { sendResendEmail } from '@/lib/email/resend'
import { renderPlainEmail } from '@/lib/email/plain-template'
import { EMAIL_ATTACHMENT_LABEL, isAllowedEmailAttachment } from '@/lib/inbox/attachment-policy'
import { isMissingDocumentSharesTable } from '@/lib/documents/client-document-access'
import nodemailer from 'nodemailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type SendPortalMessagePayload = {
  to: string
  subject: string
  body: string
  attachmentIds?: string[]
  matterId?: string
  caseId?: string
  deliveryMode?: 'portal' | 'direct'
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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

async function getContext() {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) throw new BusinessWorkspaceError('Unauthorized', 401)
  const workspace = await ensureBusinessContext(user)
  return { user, workspace }
}

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof BusinessWorkspaceError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  console.error(fallback, error)
  return NextResponse.json({ message: fallback }, { status: 500 })
}

async function sendDirectEmailMessage(params: {
  to: string
  subject: string
  textBody: string
  htmlBody: string
  replyTo?: string | null
  attachments: DirectEmailAttachment[]
}) {
  const resendConfigured = Boolean(process.env.RESEND_API_KEY)
  const gmailUser = process.env.GMAIL_USER
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD
  let delivered = false

  if (resendConfigured) {
    try {
      await sendResendEmail({
        to: params.to,
        subject: params.subject,
        textBody: params.textBody,
        htmlBody: params.htmlBody,
        tag: 'business-direct-message',
        replyTo: params.replyTo || undefined,
        attachments: params.attachments.map((attachment) => ({
          filename: attachment.name,
          content: attachment.content,
          contentType: attachment.mimeType || undefined,
        })),
      })
      delivered = true
    } catch (error) {
      if (!gmailUser || !gmailAppPassword) {
        throw error
      }
    }
  }

  if (!delivered && gmailUser && gmailAppPassword) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: { user: gmailUser, pass: gmailAppPassword },
    })

    await transporter.sendMail({
      from: gmailUser,
      to: params.to,
      subject: params.subject,
      text: params.textBody,
      html: params.htmlBody,
      replyTo: params.replyTo || undefined,
      attachments: params.attachments.map((attachment) => ({
        filename: attachment.name,
        content: attachment.content,
        contentType: attachment.mimeType || undefined,
      })),
    })
    delivered = true
  }

  if (!delivered) {
    throw new Error('Direct email is not configured yet. Set up Resend or Gmail delivery first.')
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, workspace } = await getContext()
    const payload = (await request.json().catch(() => ({}))) as SendPortalMessagePayload
    const senderEmail = normalizeEmail(asString(user.email || ''))

    const recipientEmail = normalizeEmail(asString(payload?.to))
    const subject = asString(payload?.subject)
    const body = asString(payload?.body)
    const matterId = asString(payload?.matterId)
    const caseId = asString(payload?.caseId)

    if (!recipientEmail || !subject || !body) {
      return NextResponse.json(
        { message: 'Recipient, subject, and message are required.' },
        { status: 400 },
      )
    }

    const { data: linkedClient, error: linkedClientError } = await supabaseAdmin
      .from('client_business_links')
      .select('client_id, client_name, client_email')
      .eq('business_id', workspace.businessId)
      .eq('status', 'active')
      .eq('client_email', recipientEmail)
      .maybeSingle()

    if (linkedClientError) {
      return NextResponse.json({ message: 'Unable to verify the recipient.' }, { status: 500 })
    }
    const requestedDeliveryMode = payload.deliveryMode === 'portal' ? 'portal' : 'direct'
    const deliveryMode = linkedClient && requestedDeliveryMode === 'portal' ? 'portal' : 'direct'

    if (requestedDeliveryMode === 'portal' && !linkedClient) {
      return NextResponse.json(
        { message: 'That email is not linked to an active client portal connection.' },
        { status: 403 },
      )
    }

    const attachmentIds = Array.from(
      new Set(
        Array.isArray(payload?.attachmentIds)
          ? payload.attachmentIds.map((id) => asString(id)).filter(Boolean)
          : [],
      ),
    )

    let relatedMatter:
      | {
          id: string
          case_id: string | null
          client_name: string | null
          email: string | null
          matter_number: string | null
          issue_type: string | null
          status: string | null
          stage: string | null
        }
      | null = null

    if (matterId || caseId) {
      let matterQuery = supabaseAdmin
        .from('client_matters')
        .select('id, case_id, client_name, email, matter_number, issue_type, status, stage')
        .eq('business_id', workspace.businessId)

      if (matterId) {
        matterQuery = matterQuery.eq('id', matterId)
      } else if (caseId) {
        matterQuery = matterQuery.eq('case_id', caseId)
      }

      const { data: matterRow, error: matterError } = await matterQuery.maybeSingle()

      if (matterError) {
        return NextResponse.json({ message: 'Unable to verify the selected matter.' }, { status: 500 })
      }

      if (!matterRow || normalizeEmail(asString(matterRow.email || '')) !== recipientEmail) {
        return NextResponse.json({ message: 'The selected matter does not belong to this client.' }, { status: 403 })
      }

      if (deliveryMode === 'portal' && (matterRow.status !== 'active' || matterRow.stage === 'closed')) {
        return NextResponse.json({ message: 'Documents cannot be shared to a closed or archived matter.' }, { status: 409 })
      }

      if (caseId && matterRow.case_id && asString(matterRow.case_id) !== caseId) {
        return NextResponse.json({ message: 'The selected matter context does not match.' }, { status: 400 })
      }

      relatedMatter = {
        id: String(matterRow.id),
        case_id: matterRow.case_id ? String(matterRow.case_id) : null,
        client_name: matterRow.client_name ? String(matterRow.client_name) : null,
        email: matterRow.email ? String(matterRow.email) : null,
        matter_number: matterRow.matter_number ? String(matterRow.matter_number) : null,
        issue_type: matterRow.issue_type ? String(matterRow.issue_type) : null,
        status: matterRow.status ? String(matterRow.status) : null,
        stage: matterRow.stage ? String(matterRow.stage) : null,
      }
    }

    if (attachmentIds.length > 0 && !relatedMatter && deliveryMode === 'portal') {
      return NextResponse.json(
        { message: 'Select an active matter before sharing documents with a client.' },
        { status: 400 },
      )
    }

    if (attachmentIds.length > 0 && deliveryMode === 'portal' && !linkedClient?.client_id) {
      return NextResponse.json({ message: 'The client portal account is not linked correctly.' }, { status: 409 })
    }

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
              throw new Error(`Only ${EMAIL_ATTACHMENT_LABEL} can be attached to secure messages.`)
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
      user.email?.split('@')[0] ||
      'MyMcKenzieCS Professional'

    const storedAttachments: StoredAttachment[] = attachments.map(({ content: _content, ...attachment }) => attachment)

    if (deliveryMode === 'portal') {
      const { data: insertedMessage, error: insertError } = await supabaseAdmin
        .from('inbox_messages')
        .insert({
          sender_id: user.id,
          sender_email: senderEmail || null,
          sender_name: senderName,
          recipient_email: recipientEmail,
          subject,
          content: body,
          type: 'email',
          metadata: {
            sentByBusinessDashboard: true,
            deliveryMode: 'portal',
            deliveredToPortal: true,
            mirroredToClientPortal: true,
            attachmentIds,
            attachments: storedAttachments,
            businessId: workspace.businessId,
            recipientName: linkedClient?.client_name || null,
            matterId: relatedMatter?.id || null,
            caseId: relatedMatter?.case_id || null,
            matterNumber: relatedMatter?.matter_number || null,
            matterLabel: relatedMatter?.matter_number || relatedMatter?.issue_type || null,
            matterStatus: relatedMatter?.status || null,
            matterStage: relatedMatter?.stage || null,
          },
        })
        .select('id')
        .single()

      if (insertError) {
        return NextResponse.json({ message: insertError.message || 'Failed to save message.' }, { status: 500 })
      }

      if (attachmentIds.length > 0 && relatedMatter && linkedClient?.client_id) {
        const shareRows = attachmentIds.map((documentId) => ({
          document_id: documentId,
          business_id: workspace.businessId,
          matter_id: relatedMatter.id,
          client_id: linkedClient.client_id,
          shared_by_user_id: user.id,
          revoked_at: null,
        }))
        const { error: shareError } = await supabaseAdmin
          .from('document_client_shares')
          .upsert(shareRows, { onConflict: 'document_id,matter_id,client_id' })

        if (shareError) {
          if (insertedMessage?.id) {
            await supabaseAdmin.from('inbox_messages').delete().eq('id', insertedMessage.id)
          }
          const message = isMissingDocumentSharesTable(shareError)
            ? 'Document sharing is not ready. Apply the latest database migration first.'
            : 'Unable to grant secure document access.'
          return NextResponse.json({ message }, { status: 503 })
        }
      }

      try {
        await sendPlatformMessageNotification({
          to: recipientEmail,
          recipientName: linkedClient?.client_name || null,
          senderName,
          subjectLine: subject,
          preview: body.slice(0, 180),
        })
      } catch (notificationError) {
        console.error('Failed to send secure message notification:', notificationError)
      }

      return NextResponse.json({ message: 'Secure message sent successfully.' })
    }

    const directEmailText = [
      `Hello${linkedClient?.client_name ? ` ${linkedClient.client_name}` : ''},`,
      '',
      `${senderName} has sent you a message from MyMcKenzieCS.`,
      '',
      body,
      '',
      relatedMatter?.matter_number || relatedMatter?.issue_type
        ? `Matter reference: ${relatedMatter?.matter_number || relatedMatter?.issue_type}`
        : '',
      '',
      `Reply to: ${senderEmail || 'the sender email shown in your mail app'}`,
      '',
      'Kind regards,',
      senderName,
    ].filter(Boolean).join('\n')

    const directEmailHtml = renderPlainEmail({
      preheader: `${senderName} sent you a message from MyMcKenzieCS.`,
      title: subject,
      greeting: `Hello${linkedClient?.client_name ? ` ${linkedClient.client_name}` : ''},`,
      intro: `${senderName} sent you a direct message from MyMcKenzieCS.`,
      detailsTitle: 'Message details',
      details: [
        { label: 'From', value: senderName },
        { label: 'Reply to', value: senderEmail || 'Use your email reply button' },
        ...(relatedMatter?.matter_number || relatedMatter?.issue_type
          ? [{ label: 'Matter', value: relatedMatter?.matter_number || relatedMatter?.issue_type || 'Client matter' }]
          : []),
      ],
      bodyHtml: `<p style="margin:0;white-space:pre-wrap;">${body}</p>`,
      note: 'This message was delivered directly by email. It is not a portal-only thread.',
      closing: `Kind regards,\n${senderName}`,
    })

    await sendDirectEmailMessage({
      to: recipientEmail,
      subject,
      textBody: directEmailText,
      htmlBody: directEmailHtml,
      replyTo: senderEmail || null,
      attachments,
    })

    const { error: directInsertError } = await supabaseAdmin
      .from('inbox_messages')
      .insert({
        sender_id: user.id,
        sender_email: senderEmail || null,
        sender_name: senderName,
        recipient_email: recipientEmail,
        subject,
        content: body,
        type: 'email',
        metadata: {
          sentByBusinessDashboard: true,
          deliveryMode: 'direct',
          deliveredToPortal: false,
          mirroredToClientPortal: false,
          attachmentIds,
          attachments: storedAttachments,
          businessId: workspace.businessId,
          recipientName: linkedClient?.client_name || null,
          matterId: relatedMatter?.id || null,
          caseId: relatedMatter?.case_id || null,
          matterNumber: relatedMatter?.matter_number || null,
          matterLabel: relatedMatter?.matter_number || relatedMatter?.issue_type || null,
          matterStatus: relatedMatter?.status || null,
          matterStage: relatedMatter?.stage || null,
        },
      })

    if (directInsertError) {
      console.error('Failed to save direct email to sent history:', directInsertError)
    }

    return NextResponse.json({ message: 'Direct email sent successfully.' })
  } catch (error) {
    return errorResponse(error, 'Failed to send secure message.')
  }
}
