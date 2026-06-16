import { NextRequest, NextResponse } from 'next/server'
import { crypto } from 'node:crypto'

/**
 * Security Headers Middleware
 * Adds CSP, HSTS, X-Frame-Options, and other security headers
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Content Security Policy - prevents XSS attacks
  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://js.stripe.com https://cdn.segment.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "media-src 'self' blob:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://js.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  )

  // Prevent clickjacking attacks
  response.headers.set('X-Frame-Options', 'DENY')

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // Enable XSS protection in older browsers
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // HSTS - force HTTPS (1 year)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }

  // Referrer policy - controls how much referrer info is shared
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions policy - restrict browser features
  response.headers.set(
    'Permissions-Policy',
    [
      'accelerometer=()',
      'ambient-light-sensor=()',
      'autoplay=()',
      'camera=()',
      'document-domain=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'gyroscope=()',
      'geolocation=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=(),',
      'usb=()',
    ].join(', ')
  )

  // Remove X-Powered-By header (Next.js already disables this via config)
  response.headers.delete('X-Powered-By')

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
