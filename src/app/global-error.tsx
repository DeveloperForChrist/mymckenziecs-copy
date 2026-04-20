'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPublicRouteForMarket, getPublicMarketFromPathname } from '@/lib/markets/public-routes'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [publicMarket, setPublicMarket] = useState<'GB' | 'US'>('GB')
  const homepageHref = getPublicRouteForMarket('/', publicMarket)
  const contactHref = getPublicRouteForMarket('/contact', publicMarket)

  useEffect(() => {
    setPublicMarket(getPublicMarketFromPathname(window.location.pathname))
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'global-error-boundary',
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
      }),
      keepalive: true,
    }).catch(() => undefined)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background:
            'linear-gradient(165deg, #170022 0%, #26003a 45%, #1a0030 100%)',
          color: '#f8f7ff',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <main
          style={{
            width: '100%',
            maxWidth: '640px',
            borderRadius: '16px',
            padding: '32px',
            background: 'rgba(19, 12, 35, 0.82)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 24px 70px rgba(0, 0, 0, 0.35)',
          }}
        >
          <h1 style={{ margin: '0 0 12px', fontSize: '2rem', lineHeight: 1.2 }}>
            Temporary service issue
          </h1>
          <p style={{ margin: '0 0 8px', color: 'rgba(248, 247, 255, 0.86)' }}>
            We could not complete this request right now.
          </p>
          <p style={{ margin: '0 0 24px', color: 'rgba(248, 247, 255, 0.74)' }}>
            Please try again in a moment. If this keeps happening, contact support.
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: '10px',
                padding: '10px 16px',
                fontWeight: 700,
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #4cc7ff 0%, #2d7fff 100%)',
                color: '#0b1022',
              }}
            >
              Try again
            </button>
            <Link
              href={homepageHref}
              style={{
                borderRadius: '10px',
                padding: '10px 16px',
                fontWeight: 600,
                color: '#f8f7ff',
                textDecoration: 'none',
                border: '1px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              Go to homepage
            </Link>
            <Link
              href={contactHref}
              style={{
                borderRadius: '10px',
                padding: '10px 16px',
                fontWeight: 600,
                color: '#f8f7ff',
                textDecoration: 'none',
                border: '1px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              Contact support
            </Link>
          </div>

          {error.digest ? (
            <p
              style={{
                marginTop: '24px',
                fontSize: '0.9rem',
                color: 'rgba(248, 247, 255, 0.58)',
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
