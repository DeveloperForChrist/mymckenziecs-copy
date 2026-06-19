import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'
import { apiRateLimiter, getClientIp, getIdentifier, rateLimit, rateLimitExceededResponse } from '@/lib/utils/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const suggestionSchema = z.object({
  area: z.string().min(1).max(60),
  title: z.string().min(1).max(180),
  details: z.string().min(1).max(6000),
  impact: z.string().max(3000).optional().default(''),
  contactOk: z.boolean().optional().default(true),
  contactEmail: z.string().email().optional().or(z.literal('')).optional(),
  contactName: z.string().max(180).optional(),
})

async function getContext() {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) throw new BusinessWorkspaceError('Unauthorized', 401)
  return ensureBusinessContext(user)
}

export async function POST(request: NextRequest) {
  try {
    const context = await getContext()
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })
    }

    const ip = getClientIp(request.headers)
    const identifier = `business-feedback:${getIdentifier(user.id, ip)}`
    const limit = await rateLimit(apiRateLimiter, identifier, 8, 60 * 1000)
    if (!limit.success) {
      return rateLimitExceededResponse(limit, 'Too many feedback submissions. Please try again later.')
    }

    const parsed = suggestionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ message: 'Invalid feedback payload.', details: parsed.error.issues }, { status: 400 })
    }

    const data = parsed.data
    const { error } = await supabaseAdmin.from('audit_log').insert({
      action: 'feedback_suggestion',
      details: {
        userId: user.id,
        businessId: context.businessId,
        area: data.area,
        title: data.title,
        details: data.details,
        impact: data.impact || null,
        contactOk: Boolean(data.contactOk),
        contactEmail: data.contactEmail || user.email || null,
        contactName: data.contactName || user.user_metadata?.full_name || user.user_metadata?.display_name || null,
        createdAt: new Date().toISOString(),
      },
    })

    if (error) {
      console.error('Error submitting business feedback:', error)
      return NextResponse.json({ message: 'Failed to submit suggestion.', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Suggestion submitted successfully.' })
  } catch (error) {
    if (error instanceof BusinessWorkspaceError) {
      return NextResponse.json({ message: error.message }, { status: error.status })
    }
    console.error('Error submitting business feedback:', error)
    return NextResponse.json({ message: 'Failed to submit suggestion.' }, { status: 500 })
  }
}
