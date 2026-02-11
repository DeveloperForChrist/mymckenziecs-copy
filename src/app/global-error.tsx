'use client'

import * as Sentry from '@sentry/nextjs'
import NextError from 'next/error'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div style={{padding: 24}}>
      <h1>Something went wrong</h1>
      <NextError statusCode={0} />
    </div>
  )
}
