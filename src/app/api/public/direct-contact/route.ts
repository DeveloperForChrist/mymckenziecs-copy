import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface DirectContactFormData {
  firstName: string
  lastName: string
  dateOfBirth?: string
  phone: string
  email: string
  details: string
  professionalId: string
  leadTraceId?: string
}

function toText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return fallback
  return String(value).trim()
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase()
}

function dateOnly(value: unknown) {
  const text = toText(value)
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as DirectContactFormData

    // Validate required fields
    if (!body.firstName || !body.lastName || !body.phone || !body.email || !body.details || !body.professionalId) {
      return NextResponse.json(
        { message: 'All fields are required.' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { message: 'Invalid email address.' },
        { status: 400 }
      )
    }

    // Get the business ID from the professional's user ID
    const { data: businessData, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_user_id')
      .eq('owner_user_id', body.professionalId)
      .single()

    if (businessError || !businessData) {
      console.error('Failed to fetch business:', businessError)
      return NextResponse.json(
        { message: 'Unable to find the professional. Please try again.' },
        { status: 404 }
      )
    }

    const ownerUserId = String((businessData as any).owner_user_id || '')
    if (!ownerUserId) {
      return NextResponse.json(
        { message: 'Unable to find the professional. Please try again.' },
        { status: 404 }
      )
    }

    const { data: ownerData, error: ownerError } = await supabaseAdmin.auth.admin.getUserById(ownerUserId)
    const recipientEmail = normalizeEmail(ownerData?.user?.email)
    if (ownerError || !recipientEmail) {
      console.error('Failed to resolve professional email:', ownerError)
      return NextResponse.json(
        { message: 'Unable to contact the professional right now. Please try again.' },
        { status: 500 }
      )
    }

    const traceId = toText(body.leadTraceId)

    // Create lead specifically for this business
    const leadData = {
      business_id: businessData.id,
      created_by_user_id: body.professionalId,
      name: `${toText(body.firstName)} ${toText(body.lastName)}`,
      email: toText(body.email),
      phone: toText(body.phone),
      location: '',
      issue_type: 'Direct Enquiry',
      urgency: 'medium',
      summary: toText(body.details).slice(0, 200),
      full_details: [
        traceId ? `Trace ID: ${traceId}` : null,
        toText(body.dateOfBirth) ? `Date of Birth: ${toText(body.dateOfBirth)}` : null,
        toText(body.details),
      ].filter(Boolean).join('\n\n'),
      court_date: null,
      opposing: null,
      documents: [],
      tags: ['Direct Contact', 'Directory', ...(traceId ? [`trace:${traceId}`] : [])],
      status: 'new',
      source: 'portal',
      submitted_at: new Date().toISOString(),
      accepted_at: null,
      declined_at: null,
    }

    const { error: insertError } = await supabaseAdmin
      .from('business_leads')
      .insert(leadData)

    if (insertError) {
      console.error('Failed to create lead:', insertError)
      return NextResponse.json(
        { message: 'Unable to submit your enquiry. Please try again.' },
        { status: 500 }
      )
    }

    // Create inbox message for the business
    const inboxMessageData = {
      sender_id: null,
      sender_email: normalizeEmail(toText(body.email)),
      sender_name: `${toText(body.firstName)} ${toText(body.lastName)}`,
      recipient_email: recipientEmail,
      subject: `New Direct Enquiry from ${toText(body.firstName)} ${toText(body.lastName)}`,
      content: `A new direct enquiry has been submitted via the directory.\n\n${traceId ? `Trace ID: ${traceId}\n` : ''}Name: ${toText(body.firstName)} ${toText(body.lastName)}\nEmail: ${toText(body.email)}\nPhone: ${toText(body.phone)}${toText(body.dateOfBirth) ? `\nDate of Birth: ${toText(body.dateOfBirth)}` : ''}\n\nDetails:\n${toText(body.details)}`,
      type: 'email',
      is_read: false,
      is_starred: false,
      metadata: {
        source: 'directory',
        leadType: 'direct_contact',
        firstName: toText(body.firstName),
        lastName: toText(body.lastName),
      },
    }

    const { error: inboxError } = await supabaseAdmin
      .from('inbox_messages')
      .insert(inboxMessageData)

    if (inboxError) {
      console.error('Failed to create inbox message:', inboxError)
      // Don't fail the request if inbox message fails, lead was created successfully
    }

    return NextResponse.json({
      message: 'Enquiry submitted successfully',
      leadTraceId: traceId || null,
    })
  } catch (error) {
    console.error('Direct contact submission error:', error)
    return NextResponse.json(
      { message: 'An error occurred while processing your enquiry.' },
      { status: 500 }
    )
  }
}
