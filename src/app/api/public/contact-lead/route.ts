import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import {
  emailDailyRateLimiter,
  emailRateLimiter,
  getClientIp,
  rateLimit,
  rateLimitExceededResponse,
} from '@/lib/utils/rate-limit'

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
    const firstName = toText(body.firstName)
    const lastName = toText(body.lastName)
    const phone = toText(body.phone)
    const email = toText(body.email).toLowerCase()
    const details = toText(body.details)

    // Validate required fields
    if (!firstName || !lastName || !phone || !email || !details) {
      return NextResponse.json(
        { message: 'All fields are required.' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: 'Invalid email address.' },
        { status: 400 }
      )
    }

    if (firstName.length > 100 || lastName.length > 100 || phone.length > 80 || email.length > 240 || details.length > 8000) {
      return NextResponse.json({ message: 'One or more fields are too long.' }, { status: 400 })
    }

    const ip = getClientIp(request.headers) || 'unknown'
    const shortLimit = await rateLimit(emailRateLimiter, `marketplace:${ip}`, 3, 10 * 60 * 1000)
    if (!shortLimit.success) {
      return rateLimitExceededResponse(shortLimit, 'Too many enquiries. Please try again later.')
    }
    const dailyLimit = await rateLimit(emailDailyRateLimiter, `marketplace-daily:${ip}`, 10, 24 * 60 * 60 * 1000)
    if (!dailyLimit.success) {
      return rateLimitExceededResponse(dailyLimit, 'Daily enquiry limit reached. Please try again tomorrow.')
    }

    const traceId = toText(body.leadTraceId)
    const { data, error: submitError } = await supabaseAdmin.rpc('submit_marketplace_enquiry', {
      p_client_name: `${firstName} ${lastName}`,
      p_email: email,
      p_phone: phone,
      p_date_of_birth: dateOnly(body.dateOfBirth),
      p_full_details: details,
      p_trace_id: traceId || null,
      p_location: '',
      p_issue_type: 'General Enquiry',
      p_urgency: 'medium',
    })

    if (submitError) {
      console.error('Failed to create private marketplace enquiry:', submitError)
      const noProfessionals = submitError.message?.includes('No active professionals')
      return NextResponse.json(
        { message: noProfessionals
          ? 'No active professionals are available to receive enquiries right now.'
          : 'Unable to submit your enquiry. Please try again.' },
        { status: noProfessionals ? 503 : 500 }
      )
    }

    return NextResponse.json({
      message: 'Enquiry submitted successfully',
      leadCount: typeof data?.leadCount === 'number' ? data.leadCount : 0,
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
