'use client'

import { useEffect } from 'react'

const postClientError = (payload: Record<string, any>) => {
  const body = JSON.stringify(payload)
  const url = '/api/client-error'

  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([body], { type: 'application/json' })
    const sent = navigator.sendBeacon(url, blob)
    if (sent) return
  }

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => undefined)
}

export default function ClientErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      postClientError({
        source: 'window.onerror',
        message: event.message || 'Unhandled client error',
        stack: event.error?.stack,
        pathname: window.location.pathname,
      })
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message =
        typeof reason === 'string'
          ? reason
          : reason?.message || 'Unhandled promise rejection'
      postClientError({
        source: 'window.unhandledrejection',
        message,
        stack: reason?.stack,
        pathname: window.location.pathname,
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}
