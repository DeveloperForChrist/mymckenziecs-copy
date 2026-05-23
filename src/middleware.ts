import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { readEdgeCountryCode } from '@/lib/legal/edge-country'
import { copyCookies, readStoredMarketCookie, resolveRootMarket, setMarketCookie } from '@/lib/markets/geo-routing'
import { getPublicRouteForMarket, type PublicMarket } from '@/lib/markets/public-routes'

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
  country_code?: string | null
}

type MiddlewareEntitlement = {
  plan_type?: string | null
  paid_access?: boolean | null
  plan_status?: string | null
  archive_at?: string | null
}

const UNVERIFIED_ALLOWED_PAGE_PATHS = new Set(['/dashboard'])
const UNVERIFIED_ALLOWED_API_PATHS = new Set(['/api/user', '/api/user/plan'])

function toMarketNeutralPath(pathname: string): string {
  if (pathname === '/uk' || pathname === '/us') return '/'
  if (pathname.startsWith('/uk/')) return pathname.slice(3)
  if (pathname.startsWith('/us/')) return pathname.slice(3)
  return pathname
}

function isMarketMappablePath(pathname: string): boolean {
  const neutralPath = toMarketNeutralPath(pathname)
  if (neutralPath === '/') return true
  return (
    getPublicRouteForMarket(neutralPath, 'GB') !== neutralPath ||
    getPublicRouteForMarket(neutralPath, 'US') !== neutralPath
  )
}

function resolveApprovedPublicMarket(params: {
  profileCountryCode?: string | null
  storedMarketCookie?: string | null
  edgeCountryCode?: string | null
  requestedMarket?: string | null
  authenticated: boolean
}): PublicMarket {
  const storedMarket = readStoredMarketCookie(params.storedMarketCookie)
  const edgeMarket = readStoredMarketCookie(params.edgeCountryCode)
  const profileMarket = readStoredMarketCookie(params.profileCountryCode)
  const requestedMarket = readStoredMarketCookie(params.requestedMarket)

  // Signed-in users are approved by profile/cookie/geo. Query-string market switches are ignored.
  if (params.authenticated) {
    return resolveRootMarket({
      profileCountryCode: profileMarket,
      storedMarket,
      edgeCountryCode: edgeMarket,
    })
  }

  // Guests may switch market with ?market=US|GB.
  if (requestedMarket) return requestedMarket

  return resolveRootMarket({
    storedMarket,
    edgeCountryCode: edgeMarket,
  })
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Keep old admin URLs working, but canonical login is /jesusistheadmin.
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const redirectedPath = pathname.replace(/^\/admin/, '/jesusistheadmin')
    return NextResponse.redirect(new URL(redirectedPath, request.url))
  }

  // Skip auth for public marketing pages (uk/us routes that aren't dashboard/settings)
  const isPublicMarketPage = (
    pathname === '/uk' ||
    pathname === '/us' ||
    pathname.startsWith('/uk/') ||
    pathname.startsWith('/us/')
  ) &&
    !pathname.includes('/dashboard') &&
    !pathname.includes('/chatbot') &&
    !pathname.includes('/settings')
  const isRootPath = pathname === '/'
  const isPublicMarketRoutingCandidate = (isPublicMarketPage || isRootPath) && isMarketMappablePath(pathname)

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
  const isUnverifiedAllowedPage = UNVERIFIED_ALLOWED_PAGE_PATHS.has(pathname)
  const isUnverifiedAllowedApi = pathname.startsWith('/api/') && UNVERIFIED_ALLOWED_API_PATHS.has(pathname)
  const shouldEnforceVerification =
    requiresAuth &&
    Boolean(user) &&
    !isUnverifiedAllowedPage &&
    !isUnverifiedAllowedApi
  const shouldLoadUserProfile =
    Boolean(user) &&
    (shouldEnforceVerification || requiresAdmin || isPublicMarketRoutingCandidate)

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
  if (user && shouldLoadUserProfile) {
    const profileStartedAt = Date.now()
    let profileRow: MiddlewareUserProfile | null = null
    let profileError: any = null
    {
      const result = await supabase
        .from('users')
        .select('email_verified_at, role, country_code')
        .eq('id', user.id)
        .maybeSingle()
      profileRow = result.data as MiddlewareUserProfile | null
      profileError = result.error
    }

    if (profileError?.code === '42703' && String(profileError?.message || '').toLowerCase().includes('role')) {
      const fallback = await supabase
        .from('users')
        .select('email_verified_at, country_code')
        .eq('id', user.id)
        .maybeSingle()
      profileRow = (fallback.data ? { ...fallback.data, role: null } : null) as MiddlewareUserProfile | null
      profileError = fallback.error
    }

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

  if (isPublicMarketRoutingCandidate) {
    const approvedMarket = resolveApprovedPublicMarket({
      profileCountryCode: userProfile?.country_code || (user as any)?.user_metadata?.country_code || null,
      storedMarketCookie: request.cookies.get('market')?.value || null,
      edgeCountryCode: readEdgeCountryCode(request.headers),
      requestedMarket: request.nextUrl.searchParams.get('market'),
      authenticated: Boolean(user),
    })

    const neutralPath = toMarketNeutralPath(pathname)
    const targetPath = getPublicRouteForMarket(neutralPath, approvedMarket)
    const needsPathRedirect = targetPath !== pathname
    const hasMarketQuery = request.nextUrl.searchParams.has('market')

    if (needsPathRedirect || hasMarketQuery) {
      const targetUrl = new URL(request.url)
      targetUrl.pathname = targetPath
      targetUrl.searchParams.delete('market')

      const redirectResponse = NextResponse.redirect(targetUrl)
      copyCookies(response, redirectResponse)
      setMarketCookie(redirectResponse, approvedMarket, request.nextUrl.protocol === 'https:')
      return redirectResponse
    }

    setMarketCookie(response, approvedMarket, request.nextUrl.protocol === 'https:')
  }

  if (shouldEnforceVerification && user) {
    const isEmailVerified = userProfile
      ? Boolean(userProfile.email_verified_at)
      : Boolean((user as any)?.email_confirmed_at)

    if (!isEmailVerified) {
      const redirectTarget = pathname.startsWith('/api/')
        ? '/dashboard'
        : `${pathname}${request.nextUrl.search || ''}`
      const verifyPath = `/auth/verify-email?redirect=${encodeURIComponent(redirectTarget)}`
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({
          error: 'Email verification required',
          code: 'EMAIL_VERIFICATION_REQUIRED',
          redirect: verifyPath,
        }, { status: 403 })
      }
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
    const hardLocked =
      hasPaidPlan(entitlement?.plan_type) &&
      (status === 'expired' || status === 'cancelled') &&
      Boolean(entitlement?.archive_at)

    if (hardLocked) {
      const pricingUrl = new URL('/pricing', request.url)
      pricingUrl.searchParams.set('hard_lock', '1')
      return NextResponse.redirect(pricingUrl)
    }
  }

  if (requiresPaidPlan && user) {
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
    // Public marketing routes with market prefix
    '/uk/:path*',
    '/us/:path*',
    // Only protect routes that need authentication
    '/admin/:path*',
    '/jesusistheadmin/:path*',
    '/dashboard/:path*',
    '/chatbot/:path*',
    '/settings/:path*',
    '/business/:path*',
    '/api/:path*',
  ],
}
