import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { sendPlatformMessageNotification } from '@/lib/email/platform-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type SendEmailPayload = {
  to: string
  subject: string
  body: string
  attachmentIds?: string[]
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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

    const payload = (await request.json()) as SendEmailPayload
    const to = asString(payload?.to)
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

            return foundDocs.map((doc) => ({
              documentId: String(doc.id),
              name: String(doc.name || 'Document'),
              mimeType: doc.mime_type || null,
              size: typeof doc.file_size === 'number' ? doc.file_size : null,
            }))
          })()
        : []

    const senderName =
      asString(user.user_metadata?.full_name) ||
      asString(user.user_metadata?.display_name) ||
      user.email.split('@')[0] ||
      'MyMcKenzieCS Professional'

    const { error: insertError } = await supabaseAdmin
      .from('inbox_messages')
      .insert({
        sender_id: user.id,
        sender_email: user.email,
        sender_name: senderName,
        recipient_email: to,
        subject,
        content: body,
        type: 'email',
        metadata: {
          channel: 'platform_message',
          direction: 'outbound',
          sentByBusinessDashboard: true,
          attachmentIds,
          attachments,
        },
      })

    if (insertError) {
      console.error('Failed to save platform message record:', insertError)
      return NextResponse.json({ message: 'Failed to send message.' }, { status: 500 })
    }

    try {
      await sendPlatformMessageNotification({
        to,
        senderName,
        subjectLine: subject,
        preview: `${body.slice(0, 180)}${attachments.length > 0 ? ` (${attachments.length} attachment${attachments.length === 1 ? '' : 's'})` : ''}`,
        inboxUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/client-portal`,
      })
    } catch (notificationError) {
      console.error('Failed to send platform message notification email:', notificationError)
    }

    return NextResponse.json({ message: 'Message sent successfully.' })
  } catch (error) {
    console.error('Business send email error:', error)
    return NextResponse.json({ message: 'Failed to send message.' }, { status: 500 })
  }
}
