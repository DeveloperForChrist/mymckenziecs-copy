import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function hasPaidPlan(plan: unknown): boolean {
  const label = String(plan || '').toLowerCase()
  return (
    label.includes('basic') ||
    label.includes('premium')
  )
}

function hasCaseProfileAccess(plan: unknown): boolean {
  const label = String(plan || '').toLowerCase()
  if (!label) return false
  if (label.includes('basic')) return false
  return label.includes('premium')
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Migrate legacy admin URLs to the new admin path.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const redirectedPath = pathname.replace(/^\/admin/, '/jesusistheadmin')
    return NextResponse.redirect(new URL(redirectedPath, request.url))
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if exists
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes - require authentication
  const protectedPaths = [
    '/dashboard',
    '/chatbot',
    '/settings',
    '/api/chat',
    '/api/analyze-document',
    '/api/analyse-doc',
    '/api/search-case-law',
    '/api/cases',
    '/api/case-study',
    '/api/case-study-chat',
    '/api/case-analysis',
    '/api/case-summary',
    '/api/drafts',
    '/api/evidence-bundle',
    '/api/doc-review',
    '/api/calendar',
    '/api/chat-history',
    '/api/chat-upload',
    '/api/message-count',
    '/api/passes',
    '/api/user',
  ]
  const paidPlanPaths = [
    '/api/chat',
    '/api/analyze-document',
    '/api/analyse-doc',
    '/api/search-case-law',
    '/api/cases',
    '/api/case-study',
    '/api/case-study-chat',
    '/api/case-analysis',
    '/api/case-summary',
    '/api/drafts',
    '/api/evidence-bundle',
    '/api/doc-review',
    '/api/calendar',
    '/api/chat-history',
    '/api/chat-upload',
    '/api/message-count',
    '/api/passes',
  ]

  // Admin routes - require admin role
  const adminPaths = ['/jesusistheadmin', '/api/admin']

  // Check if path requires authentication
  const requiresAuth = protectedPaths.some((path) => pathname.startsWith(path))
  const requiresAdmin = adminPaths.some((path) => pathname.startsWith(path))

  if (requiresAuth && !user) {
    // Redirect to sign-in for protected routes
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const redirectUrl = new URL('/auth/signin', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  const softSuspendedPaths = ['/dashboard', '/chatbot', '/settings']
  const isSoftSuspendedPath = softSuspendedPaths.some((path) => pathname.startsWith(path))

  if (user && isSoftSuspendedPath) {
    const { data: latestSub } = await supabase
      .from('subscriptions')
      .select('plan_type, status, lifecycle_archived_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const status = String(latestSub?.status || '').toLowerCase()
    const hardLocked =
      hasPaidPlan(latestSub?.plan_type) &&
      (status === 'expired' || status === 'cancelled') &&
      Boolean(latestSub?.lifecycle_archived_at)

    if (hardLocked) {
      const pricingUrl = new URL('/pricing', request.url)
      pricingUrl.searchParams.set('hard_lock', '1')
      return NextResponse.redirect(pricingUrl)
    }
  }

  const requiresPaidPlan = paidPlanPaths.some((path) => pathname.startsWith(path)) && user

  if (requiresPaidPlan && user) {
    const { data: activeSub, error: subError } = await supabase
      .from('subscriptions')
      .select('plan_type')
      .eq('user_id', user.id)
      .in('status', ['active', 'past_due'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subError) {
      console.error('Error checking subscription status in middleware:', subError)
    }

    if (!hasPaidPlan(activeSub?.plan_type)) {
      if (pathname.startsWith('/api/')) {
        const method = request.method.toUpperCase()
        const isReadOnlyAllowed =
          method === 'GET' &&
          (pathname.startsWith('/api/cases') || pathname.startsWith('/api/chat-history'))
        if (isReadOnlyAllowed) {
          return response
        }
        return NextResponse.json({ error: 'Payment required' }, { status: 402 })
      }
    }

    if (pathname.startsWith('/dashboard/case-profile') && activeSub && !hasCaseProfileAccess(activeSub?.plan_type)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  if (requiresAdmin && user) {
    // Check if user has admin role
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    // Log for debugging
    if (profileError) {
      console.error('Error fetching user profile:', profileError)
    }

    if (!profile || profile.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ 
          error: 'Forbidden - Admin access required',
          message: 'Your account does not have admin privileges. Contact support if you need admin access.',
          debug: { hasProfile: !!profile, role: profile?.role, userId: user.id }
        }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
