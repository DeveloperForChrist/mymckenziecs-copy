import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { createBusinessAlert } from '@/lib/business/alerts'
import { sendPlatformMessageNotification } from '@/lib/email/platform-notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ClientMessageFormData {
  businessId: string
  subject: string
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ClientMessageFormData

    if (!body.businessId || !body.subject || !body.content) {
      return NextResponse.json(
        { message: 'Business ID, subject, and content are required.' },
        { status: 400 }
      )
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { message: 'Unauthorized.' },
        { status: 401 }
      )
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return NextResponse.json(
        { message: 'Unauthorized.' },
        { status: 401 }
      )
    }

    // Verify the client is linked to this business
    const { data: link } = await supabaseAdmin
      .from('client_business_links')
      .select('*')
      .eq('client_id', user.id)
      .eq('business_id', body.businessId)
      .eq('status', 'active')
      .single()

    if (!link) {
      return NextResponse.json(
        { message: 'You are not authorized to message this business.' },
        { status: 403 }
      )
    }

    // Get business email
    const { data: businessData } = await supabaseAdmin
      .from('businesses')
      .select('owner_user_id')
      .eq('id', body.businessId)
      .single()

    if (!businessData) {
      return NextResponse.json(
        { message: 'Business not found.' },
        { status: 404 }
      )
    }

    // Get business owner email
    const { data: ownerData } = await supabaseAdmin.auth.admin.getUserById(
      businessData.owner_user_id
    )

    if (!ownerData?.user?.email) {
      return NextResponse.json(
        { message: 'Business owner not found.' },
        { status: 404 }
      )
    }

    // Create inbox message for the business
    const { error: insertError } = await supabaseAdmin
      .from('inbox_messages')
      .insert({
        sender_id: user.id,
        sender_email: user.email,
        sender_name: link.client_name || user.email?.split('@')[0] || 'Client',
        recipient_email: ownerData.user.email,
        subject: body.subject,
        content: body.content,
        type: 'email',
        metadata: {
          fromClient: true,
          clientId: user.id,
          clientName: link.client_name,
          businessId: body.businessId,
        },
      })

    if (insertError) {
      console.error('Failed to create message:', insertError)
      return NextResponse.json(
        { message: 'Failed to send message.' },
        { status: 500 }
      )
    }

    try {
      await sendPlatformMessageNotification({
        to: ownerData.user.email,
        senderName: link.client_name || user.email?.split('@')[0] || 'Client',
        subjectLine: body.subject,
        preview: body.content.slice(0, 180),
        inboxUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/business/dashboard`,
      })
    } catch (notificationError) {
      console.error('Failed to send platform message notification email:', notificationError)
    }

    await createBusinessAlert({
      businessId: body.businessId,
      type: 'message',
      priority: 'medium',
      title: 'New message from client',
      body: `${link.client_name || user.email || 'Client'} sent: ${body.subject}`,
      clientName: (link.client_name as string) || null,
      actionLabel: 'Reply',
      dedupeKey: `client-message:${body.businessId}:${user.id}:${String(body.subject || '').trim().toLowerCase()}`,
      dedupeWindowMinutes: 2,
      metadata: {
        fromClient: true,
        subject: body.subject,
        clientId: user.id,
        businessId: body.businessId,
      },
    })

    return NextResponse.json({
      message: 'Message sent successfully',
    })
  } catch (error) {
    console.error('Client message error:', error)
    return NextResponse.json(
      { message: 'An error occurred while processing your message.' },
      { status: 500 }
    )
  }
}
