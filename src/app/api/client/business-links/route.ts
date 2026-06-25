import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { createBusinessAlert } from '@/lib/business/alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const supabase = await createSupabaseRouteClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    if (!user) return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 })

    const { data: links, error } = await supabaseAdmin
      .from('client_business_links')
      .select('id, business_id, client_name, client_email, status, created_at, updated_at, businesses(name)')
      .eq('client_id', user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Client business links load error:', error)
      return NextResponse.json({ message: 'Unable to load client portal connections.' }, { status: 500 })
    }

    return NextResponse.json({
      links: (links || []).map((link: any) => ({
        id: String(link.id),
        business_id: String(link.business_id),
        client_name: String(link.client_name || '').trim(),
        client_email: String(link.client_email || '').trim(),
        status: String(link.status || 'active'),
        created_at: link.created_at || null,
        updated_at: link.updated_at || null,
        business_name: String(link.businesses?.name || 'Legal Professional'),
      })),
    })
  } catch (error) {
    console.error('Client business links GET error:', error)
    return NextResponse.json({ message: 'Unable to load client portal connections.' }, { status: 500 })
  }
}

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
