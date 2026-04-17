import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const REQUEST_TIMING_WARN_MS = parsePositiveInt(process.env.REQUEST_TIMING_WARN_MS, 250)
const LOG_REQUEST_TIMING = process.env.LOG_REQUEST_TIMING === '1'

const logMiddlewarePerf = (
  phase: string,
  startedAt: number,
  pathname: string,
  metadata?: Record<string, string | number | boolean>
) => {
  const durationMs = Date.now() - startedAt
  if (!LOG_REQUEST_TIMING && durationMs < REQUEST_TIMING_WARN_MS) return
  const extra = metadata
    ? Object.entries(metadata).map(([key, value]) => `${key}=${String(value)}`).join(' ')
    : ''
  console.info(`[perf][middleware] phase=${phase} duration_ms=${durationMs} path=${pathname}${extra ? ` ${extra}` : ''}`)
}

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

type MiddlewareUserProfile = {
  email_verified_at?: string | null
  role?: string | null
}

type MiddlewareEntitlement = {
  plan_type?: string | null
  paid_access?: boolean | null
  plan_status?: string | null
  archive_at?: string | null
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Keep old admin URLs working, but canonical login is /jesusistheadmin.
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
          cookiesToSet.forEach(({ name, value }) =>
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
  const authStartedAt = Date.now()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  logMiddlewarePerf('auth.getUser', authStartedAt, pathname, { authenticated: Boolean(user) })

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
  const shouldEnforceVerification =
    requiresAuth &&
    Boolean(user) &&
    !pathname.startsWith('/api/')
  const needsUserProfile = Boolean(user) && (shouldEnforceVerification || requiresAdmin)

  if (requiresAuth && !user) {
    // Redirect to sign-in for protected routes
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const redirectUrl = new URL('/auth/signin', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  let userProfile: MiddlewareUserProfile | null = null
  if (user && needsUserProfile) {
    const profileStartedAt = Date.now()
    const { data: profileRow, error: profileError } = await supabase
      .from('users')
      .select('email_verified_at, role')
      .eq('id', user.id)
      .maybeSingle()

    logMiddlewarePerf('user.profile', profileStartedAt, pathname, {
      hasRow: Boolean(profileRow),
      hasError: Boolean(profileError),
      needsVerification: shouldEnforceVerification,
      needsAdmin: requiresAdmin,
    })

    if (profileError) {
      console.error('Error checking user profile in middleware:', profileError)
    } else {
      userProfile = profileRow
    }
  }

  if (shouldEnforceVerification && user) {
    const isEmailVerified = userProfile
      ? Boolean(userProfile.email_verified_at)
      : Boolean((user as any)?.email_confirmed_at)

    if (!isEmailVerified) {
      const redirectTarget = `${pathname}${request.nextUrl.search || ''}`
      const verifyPath = `/auth/verify-email?redirect=${encodeURIComponent(redirectTarget)}`
      return NextResponse.redirect(new URL(verifyPath, request.url))
    }
  }

  const softSuspendedPaths = ['/dashboard', '/chatbot', '/settings']
  const isSoftSuspendedPath = softSuspendedPaths.some((path) => pathname.startsWith(path))
  const requiresPaidPlan = paidPlanPaths.some((path) => pathname.startsWith(path)) && Boolean(user)

  let entitlement: MiddlewareEntitlement | null = null

  if (user && (isSoftSuspendedPath || requiresPaidPlan)) {
    const entitlementStartedAt = Date.now()
    const { data: entitlementRow, error: entitlementError } = await supabase
      .from('user_entitlements')
      .select('plan_type, paid_access, plan_status, archive_at')
      .eq('user_id', user.id)
      .maybeSingle()

    logMiddlewarePerf('user_entitlements.snapshot', entitlementStartedAt, pathname, {
      hasRow: Boolean(entitlementRow),
      hasError: Boolean(entitlementError),
    })

    if (entitlementError) {
      console.error('Error checking entitlement status in middleware:', entitlementError)
    } else {
      entitlement = entitlementRow
      if (!entitlement) {
        const fallbackStartedAt = Date.now()
        const { data: fallbackSub, error: fallbackError } = await supabase
          .from('subscriptions')
          .select('plan_type, status, lifecycle_archive_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        logMiddlewarePerf('subscriptions.fallback', fallbackStartedAt, pathname, {
          hasRow: Boolean(fallbackSub),
          hasError: Boolean(fallbackError),
        })

        if (fallbackError) {
          console.error('Error checking fallback subscription state in middleware:', fallbackError)
        } else if (fallbackSub) {
          const fallbackStatus = String(fallbackSub.status || '').toLowerCase()
          entitlement = {
            plan_type: fallbackSub.plan_type,
            plan_status: fallbackStatus,
            paid_access:
              hasPaidPlan(fallbackSub.plan_type) &&
              (fallbackStatus === 'active' || fallbackStatus === 'trialing' || fallbackStatus === 'past_due'),
            archive_at: fallbackSub.lifecycle_archive_at,
          }
        }
      }
    }
  }

  if (user && isSoftSuspendedPath) {
    const status = String(entitlement?.plan_status || '').toLowerCase()
    const paid = Boolean(entitlement?.paid_access)
    const hardLocked =
      hasPaidPlan(entitlement?.plan_type) &&
      (status === 'expired' || status === 'cancelled') &&
      Boolean(entitlement?.archive_at)

    if (hardLocked) {
      const pricingUrl = new URL('/pricing', request.url)
      pricingUrl.searchParams.set('hard_lock', '1')
      return NextResponse.redirect(pricingUrl)
    }

    if (!paid && isSoftSuspendedPath) {
      if (pathname === '/dashboard') {
        return response
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  if (requiresPaidPlan && user) {
    if (!Boolean(entitlement?.paid_access)) {
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

    if (pathname.startsWith('/dashboard/case-profile') && entitlement && !hasCaseProfileAccess(entitlement?.plan_type)) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  if (requiresAdmin && user) {
    if (!userProfile || userProfile.role !== 'admin') {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ 
          error: 'Forbidden - Admin access required',
          message: 'Your account does not have admin privileges. Contact support if you need admin access.',
          debug: { hasProfile: !!userProfile, role: userProfile?.role, userId: user.id }
        }, { status: 403 })
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/jesusistheadmin/:path*',
    '/dashboard/:path*',
    '/chatbot/:path*',
    '/settings/:path*',
    '/api/chat/:path*',
    '/api/analyze-document/:path*',
    '/api/analyse-doc/:path*',
    '/api/search-case-law/:path*',
    '/api/cases/:path*',
    '/api/case-study/:path*',
    '/api/case-study-chat/:path*',
    '/api/case-analysis/:path*',
    '/api/case-summary/:path*',
    '/api/drafts/:path*',
    '/api/evidence-bundle/:path*',
    '/api/doc-review/:path*',
    '/api/calendar/:path*',
    '/api/chat-history/:path*',
    '/api/chat-upload/:path*',
    '/api/message-count/:path*',
    '/api/passes/:path*',
    '/api/user/:path*',
    '/api/admin/:path*',
  ],
}
