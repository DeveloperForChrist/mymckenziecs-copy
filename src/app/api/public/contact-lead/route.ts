import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface ContactFormData {
  firstName: string
  lastName: string
  dateOfBirth?: string
  phone: string
  email: string
  details: string
  leadTraceId?: string
}

function toText(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim()
  if (value === null || value === undefined) return fallback
  return String(value).trim()
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
    const body = await request.json() as ContactFormData

    // Validate required fields
    if (!body.firstName || !body.lastName || !body.phone || !body.email || !body.details) {
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

    // Get all businesses to distribute the lead to
    const { data: businesses, error: businessesError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('status', 'active')

    if (businessesError) {
      console.error('Failed to fetch businesses:', businessesError)
      return NextResponse.json(
        { message: 'Unable to process your enquiry at this time.' },
        { status: 500 }
      )
    }

    if (!businesses || businesses.length === 0) {
      // If no active businesses, still create the lead but without a business_id
      // This allows businesses to see it later when they become active
      console.log('No active businesses found, creating lead without business assignment')
    }

    const traceId = toText(body.leadTraceId)

    // Create lead for each active business (or one lead if no businesses)
    const leadsToCreate = businesses && businesses.length > 0 
      ? businesses.map(business => ({
          business_id: business.id,
          name: `${toText(body.firstName)} ${toText(body.lastName)}`,
          email: toText(body.email),
          phone: toText(body.phone),
          location: '',
          issue_type: 'General Enquiry',
          urgency: 'medium',
          summary: toText(body.details).slice(0, 200),
          full_details: [
            traceId ? `Trace ID: ${traceId}` : null,
            (() => {
              const dob = dateOnly(body.dateOfBirth)
              return dob ? `Date of Birth: ${dob}` : null
            })(),
            toText(body.details),
          ].filter(Boolean).join('\n\n'),
          court_date: null,
          opposing: null,
          documents: [],
          tags: ['Contact Form', ...(traceId ? [`trace:${traceId}`] : [])],
          status: 'new',
          source: 'portal',
          submitted_at: new Date().toISOString(),
          accepted_at: null,
          declined_at: null,
        }))
      : [{
          business_id: null,
          name: `${toText(body.firstName)} ${toText(body.lastName)}`,
          email: toText(body.email),
          phone: toText(body.phone),
          location: '',
          issue_type: 'General Enquiry',
          urgency: 'medium',
          summary: toText(body.details).slice(0, 200),
          full_details: [
            traceId ? `Trace ID: ${traceId}` : null,
            (() => {
              const dob = dateOnly(body.dateOfBirth)
              return dob ? `Date of Birth: ${dob}` : null
            })(),
            toText(body.details),
          ].filter(Boolean).join('\n\n'),
          court_date: null,
          opposing: null,
          documents: [],
          tags: ['Contact Form', ...(traceId ? [`trace:${traceId}`] : [])],
          status: 'new',
          source: 'portal',
          submitted_at: new Date().toISOString(),
          accepted_at: null,
          declined_at: null,
        }]

    const { error: insertError } = await supabaseAdmin
      .from('business_leads')
      .insert(leadsToCreate)

    if (insertError) {
      console.error('Failed to create lead:', insertError)
      return NextResponse.json(
        { message: 'Unable to submit your enquiry. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'Enquiry submitted successfully',
      leadCount: leadsToCreate.length,
      leadTraceId: traceId || null,
    })
  } catch (error) {
    console.error('Contact lead submission error:', error)
    return NextResponse.json(
      { message: 'An error occurred while processing your enquiry.' },
      { status: 500 }
    )
  }
}
