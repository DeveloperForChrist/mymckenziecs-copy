import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { createBusinessAlert } from '@/lib/business/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const linkId = typeof body?.linkId === 'string' ? body.linkId.trim() : ''
    if (!linkId) return NextResponse.json({ message: 'linkId is required.' }, { status: 400 })

    const { data: link, error: linkError } = await supabaseAdmin
      .from('client_business_links')
      .select('id, business_id, client_name, status')
      .eq('id', linkId)
      .eq('client_id', user.id)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ message: 'Client link not found.' }, { status: 404 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('client_business_links')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', linkId)
      .eq('client_id', user.id)

    if (updateError) {
      return NextResponse.json({ message: 'Unable to leave this professional link.' }, { status: 500 })
    }

    await createBusinessAlert({
      businessId: String(link.business_id),
      type: 'system',
      priority: 'low',
      title: 'Client left portal link',
      body: `${link.client_name || user.email || 'A client'} left the portal connection.`,
      clientName: (link.client_name as string) || null,
      actionLabel: 'View Client Work',
      metadata: { clientId: user.id, linkId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Client business link leave error:', error)
    return NextResponse.json({ message: 'Unable to process request.' }, { status: 500 })
  }
}
