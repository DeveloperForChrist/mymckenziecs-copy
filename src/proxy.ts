import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { readEdgeCountryCode } from '@/lib/legal/edge-country'
import { readStoredMarketCookie, resolveRootMarket, setMarketCookie } from '@/lib/markets/geo-routing'
import { getPublicRouteForMarket, type PublicMarket } from '@/lib/markets/public-routes'

const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const REQUEST_TIMING_WARN_MS = parsePositiveInt(process.env.REQUEST_TIMING_WARN_MS, 250)
const LOG_REQUEST_TIMING = process.env.LOG_REQUEST_TIMING === '1'
const PROXY_PROFILE_CACHE_TTL_MS = parsePositiveInt(process.env.PROXY_PROFILE_CACHE_TTL_MS, 30_000)
const PROXY_ENTITLEMENT_CACHE_TTL_MS = parsePositiveInt(process.env.PROXY_ENTITLEMENT_CACHE_TTL_MS, 15_000)

type ProxyCacheEntry<T> = {
  expiresAt: number
  value: T
}

const proxyProfileCache = new Map<string, ProxyCacheEntry<MiddlewareUserProfile | null>>()
const proxyEntitlementCache = new Map<string, ProxyCacheEntry<MiddlewareEntitlement | null>>()

function readProxyCache<T>(cache: Map<string, ProxyCacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return entry.value
}

function writeProxyCache<T>(cache: Map<string, ProxyCacheEntry<T>>, key: string, value: T, ttlMs: number) {
  cache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  })
}

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
  console.info(`[perf][proxy] phase=${phase} duration_ms=${durationMs} path=${pathname}${extra ? ` ${extra}` : ''}`)
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

function isIgnorableMissingAuthSessionError(error: unknown): boolean {
  const code = String((error as any)?.code || '').toLowerCase()
  const name = String((error as any)?.name || '').toLowerCase()
  const message = String((error as any)?.message || '').toLowerCase()
  return (
    code === 'refresh_token_not_found' ||
    name.includes('authsessionmissing') ||
    message.includes('refresh token') ||
    message.includes('auth session missing') ||
    message.includes('session missing')
  )
}

type MiddlewareUserProfile = {
  email_verified_at?: string | null
  country_code?: string | null
}

type MiddlewareEntitlement = {
  plan_type?: string | null
  paid_access?: boolean | null
  plan_status?: string | null
  archive_at?: string | null
}

const UNVERIFIED_ALLOWED_PAGE_PATHS = new Set(['/dashboard'])
const UNVERIFIED_ALLOWED_API_PATHS = new Set(['/api/chat', '/api/user', '/api/user/plan'])

const PROTECTED_PATHS = [
  '/dashboard',
  '/client-portal',
  '/chatbot',
  '/settings',
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

const PAID_PLAN_PATHS = [
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

const ADMIN_PATHS = ['/jesusistheadmin', '/api/admin']
const SOFT_SUSPENDED_PATHS = ['/dashboard', '/chatbot', '/settings']

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

function isSocialCrawler(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || '').toLowerCase()
  if (!ua) return false
  return (
    ua.includes('facebookexternalhit') ||
    ua.includes('facebot') ||
    ua.includes('twitterbot') ||
    ua.includes('linkedinbot') ||
    ua.includes('slackbot') ||
    ua.includes('whatsapp') ||
    ua.includes('telegrambot') ||
    ua.includes('discordbot') ||
    ua.includes('skypeuripreview')
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

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const userAgent = request.headers.get('user-agent')
  const socialCrawler = isSocialCrawler(userAgent)
  const requestedMarket = readStoredMarketCookie(request.nextUrl.searchParams.get('market'))

  if (pathname === '/') {
    const destinationPath = socialCrawler ? '/uk' : (requestedMarket === 'US' ? '/us' : '/uk')
    const url = new URL(destinationPath, request.url)

    request.nextUrl.searchParams.forEach((value, key) => {
      if (key === 'market') return
      url.searchParams.set(key, value)
    })

    return NextResponse.redirect(url, 308)
  }

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

  if (isPublicMarketRoutingCandidate) {
    const explicitPathMarket = pathname === '/us' || pathname.startsWith('/us/')
      ? 'US'
      : pathname === '/uk' || pathname.startsWith('/uk/')
        ? 'GB'
        : null
    const approvedMarket = socialCrawler
      ? 'GB'
      : explicitPathMarket || resolveApprovedPublicMarket({
        storedMarketCookie: request.cookies.get('market')?.value || null,
        edgeCountryCode: readEdgeCountryCode(request.headers),
        requestedMarket: request.nextUrl.searchParams.get('market'),
        authenticated: false,
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
      setMarketCookie(redirectResponse, approvedMarket, request.nextUrl.protocol === 'https:')
      return redirectResponse
    }

    const publicResponse = NextResponse.next({
      request: {
        headers: request.headers,
      },
    })
    setMarketCookie(publicResponse, approvedMarket, request.nextUrl.protocol === 'https:')
    return publicResponse
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const requiresAuth = PROTECTED_PATHS.some((path) => pathname.startsWith(path))
  const requiresAdmin = ADMIN_PATHS.some((path) => pathname.startsWith(path))
  const isSoftSuspendedPath = SOFT_SUSPENDED_PATHS.some((path) => pathname.startsWith(path))
  const requiresPaidPlanPath = PAID_PLAN_PATHS.some((path) => pathname.startsWith(path))
  const needsProxyAuth = requiresAuth || requiresAdmin || isSoftSuspendedPath || requiresPaidPlanPath

  if (!needsProxyAuth) {
    return response
  }

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

  // Refresh session if exists. Stale browser cookies can contain a refresh token
  // Supabase no longer recognises; treat that as an anonymous request and clear
  // auth cookies instead of logging noisy AuthApiError stacks on public pages.
  const authStartedAt = Date.now()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  const user = authError ? null : authData.user
  if (authError) {
    if (isIgnorableMissingAuthSessionError(authError)) {
      request.cookies.getAll().forEach((cookie) => {
        if (cookie.name.startsWith('sb-') || cookie.name.includes('supabase')) {
          response.cookies.delete(cookie.name)
        }
      })
    } else {
      console.error('Error refreshing auth session in proxy:', authError)
    }
  }
  logMiddlewarePerf('auth.getUser', authStartedAt, pathname, { authenticated: Boolean(user) })

  const isUnverifiedAllowedPage = UNVERIFIED_ALLOWED_PAGE_PATHS.has(pathname)
  const isUnverifiedAllowedApi = pathname.startsWith('/api/') && UNVERIFIED_ALLOWED_API_PATHS.has(pathname)
  const shouldEnforceVerification =
    requiresAuth &&
    Boolean(user) &&
    !isUnverifiedAllowedPage &&
    !isUnverifiedAllowedApi
  const shouldLoadUserProfile =
    Boolean(user) &&
    (shouldEnforceVerification || isPublicMarketRoutingCandidate)

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
    const profileCacheKey = `profile:${user.id}`
    const cachedProfile = readProxyCache(proxyProfileCache, profileCacheKey)
    let profileRow: MiddlewareUserProfile | null = cachedProfile === undefined ? null : cachedProfile
    let profileError: any = null
    const profileCacheHit = cachedProfile !== undefined

    if (!profileCacheHit) {
      const result = await supabase
        .from('users')
        .select('email_verified_at, country_code')
        .eq('id', user.id)
        .maybeSingle()
      profileRow = result.data as MiddlewareUserProfile | null
      profileError = result.error
    }

    logMiddlewarePerf('user.profile', profileStartedAt, pathname, {
      hasRow: Boolean(profileRow),
      hasError: Boolean(profileError),
      needsVerification: shouldEnforceVerification,
      needsAdmin: requiresAdmin,
      cacheHit: profileCacheHit,
    })

    if (profileError) {
      console.error('Error checking user profile in proxy:', profileError)
    } else {
      userProfile = profileRow
      if (!profileCacheHit) {
        writeProxyCache(proxyProfileCache, profileCacheKey, profileRow, PROXY_PROFILE_CACHE_TTL_MS)
      }
    }
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

  const requiresPaidPlan = requiresPaidPlanPath && Boolean(user)

  let entitlement: MiddlewareEntitlement | null = null

  if (user && (isSoftSuspendedPath || requiresPaidPlan)) {
    const entitlementStartedAt = Date.now()
    const entitlementCacheKey = `entitlement:${user.id}`
    const cachedEntitlement = readProxyCache(proxyEntitlementCache, entitlementCacheKey)
    let entitlementRow: MiddlewareEntitlement | null = cachedEntitlement === undefined ? null : cachedEntitlement
    let entitlementError: any = null
    const entitlementCacheHit = cachedEntitlement !== undefined

    if (!entitlementCacheHit) {
      const result = await supabase
        .from('user_entitlements')
        .select('plan_type, paid_access, plan_status, archive_at')
        .eq('user_id', user.id)
        .maybeSingle()
      entitlementRow = result.data as MiddlewareEntitlement | null
      entitlementError = result.error
    }

    logMiddlewarePerf('user_entitlements.snapshot', entitlementStartedAt, pathname, {
      hasRow: Boolean(entitlementRow),
      hasError: Boolean(entitlementError),
      cacheHit: entitlementCacheHit,
    })

    if (entitlementError) {
      console.error('Error checking entitlement status in proxy:', entitlementError)
    } else {
      entitlement = entitlementRow
      if (!entitlement && !entitlementCacheHit) {
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
          console.error('Error checking fallback subscription state in proxy:', fallbackError)
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
      if (!entitlementCacheHit) {
        writeProxyCache(proxyEntitlementCache, entitlementCacheKey, entitlement, PROXY_ENTITLEMENT_CACHE_TTL_MS)
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
    '/client-portal',
    '/chatbot/:path*',
    '/settings/:path*',
    '/business/:path*',
    '/api/:path*',
  ],
}
