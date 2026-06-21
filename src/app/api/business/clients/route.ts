import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/database/supabase-route'
import { supabaseAdmin } from '@/lib/database/supabase-server'
import { BusinessWorkspaceError, ensureBusinessContext } from '@/lib/business/business-workspace'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type BusinessClientRecord = {
  id: string
  client_name: string | null
  client_email: string | null
  updated_at: string | null
  created_at: string | null
}

async function getContext() {
  const supabase = await createSupabaseRouteClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) throw new BusinessWorkspaceError('Unauthorized', 401)
  const workspace = await ensureBusinessContext(user)
  return { workspace }
}

function errorResponse(error: unknown) {
  if (error instanceof BusinessWorkspaceError) {
    return NextResponse.json({ message: error.message }, { status: error.status })
  }
  console.error('Unable to load business clients.', error)
  return NextResponse.json({ message: 'Unable to load business clients.' }, { status: 500 })
}

function toLabel(name: string | null, email: string | null) {
  const safeName = String(name || '').trim()
  const safeEmail = String(email || '').trim()
  if (safeName && safeEmail) return `${safeName} <${safeEmail}>`
  return safeName || safeEmail || 'Client'
}

export async function GET() {
  try {
    const { workspace } = await getContext()

    const { data, error } = await supabaseAdmin
      .from('client_business_links')
      .select('id, client_name, client_email, updated_at, created_at')
      .eq('business_id', workspace.businessId)
      .eq('status', 'active')
      .not('client_email', 'is', null)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ message: 'Unable to load business clients.' }, { status: 500 })
    }

    const clients = (data || [])
      .map((row) => {
        const record = row as BusinessClientRecord
        const email = String(record.client_email || '').trim().toLowerCase()
        if (!email) return null
        const name = String(record.client_name || '').trim()
        return {
          id: String(record.id),
          name: name || email.split('@')[0] || 'Client',
          email,
          label: toLabel(name || null, email),
          updatedAt: record.updated_at || record.created_at || null,
        }
      })
      .filter((client): client is { id: string; name: string; email: string; label: string; updatedAt: string | null } => client !== null)

    return NextResponse.json({ clients })
  } catch (error) {
    return errorResponse(error)
  }
}
