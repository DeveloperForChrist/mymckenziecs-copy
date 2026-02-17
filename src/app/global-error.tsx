'use client'

import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
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
    <div style={{padding: 24}}>
      <h1>Something went wrong</h1>
      <NextError statusCode={0} />
    </div>
  )
}
