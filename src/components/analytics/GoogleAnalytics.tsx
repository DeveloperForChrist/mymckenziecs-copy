'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  ANALYTICS_CONSENT_UPDATED_EVENT,
  readAnalyticsConsent,
} from '@/lib/analytics/consent'

declare global {
  interface Window {
    dataLayer: unknown[][]
    gtag?: (...args: unknown[]) => void
    __mymckenzieGaInitialized?: string
  }
}

const ensureGoogleAnalyticsScript = (measurementId: string) => {
  if (typeof document === 'undefined') {
    return
  }

  const existingScript = document.querySelector(
    `script[data-google-analytics-id="${measurementId}"]`
  )

  if (existingScript) {
    return
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`
  script.dataset.googleAnalyticsId = measurementId
  document.head.appendChild(script)
}

const ensureGoogleAnalyticsClient = (measurementId: string) => {
  if (typeof window === 'undefined') {
    return
  }

  window.dataLayer = window.dataLayer || []

  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer.push(args)
    }
  }

  if (window.__mymckenzieGaInitialized !== measurementId) {
    window.gtag('js', new Date())
    window.gtag('config', measurementId, { send_page_view: false })
    window.__mymckenzieGaInitialized = measurementId
  }

  ensureGoogleAnalyticsScript(measurementId)
}

type GoogleAnalyticsProps = {
  measurementId?: string
}

export default function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const trimmedMeasurementId = measurementId?.trim() || ''
  const pathname = usePathname()
  const lastTrackedPathRef = useRef<string | null>(null)
  const [hasConsent, setHasConsent] = useState(false)

  useEffect(() => {
    if (!trimmedMeasurementId) {
      return
    }

    const syncConsent = () => {
      const analyticsEnabled = readAnalyticsConsent()?.analytics === true
      setHasConsent(analyticsEnabled)
    }

    syncConsent()
    window.addEventListener(ANALYTICS_CONSENT_UPDATED_EVENT, syncConsent as EventListener)

    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_UPDATED_EVENT, syncConsent as EventListener)
    }
  }, [trimmedMeasurementId])

  useEffect(() => {
    if (!trimmedMeasurementId || typeof window === 'undefined') {
      return
    }

    const windowWithAnalyticsFlags = window as unknown as Record<string, unknown>
    windowWithAnalyticsFlags[`ga-disable-${trimmedMeasurementId}`] = !hasConsent

    if (!hasConsent) {
      lastTrackedPathRef.current = null
      return
    }

    ensureGoogleAnalyticsClient(trimmedMeasurementId)
  }, [hasConsent, trimmedMeasurementId])

  useEffect(() => {
    if (!trimmedMeasurementId || !hasConsent || typeof window.gtag !== 'function') {
      return
    }

    const query = window.location.search
    const pagePath = query ? `${pathname}${query}` : pathname

    if (lastTrackedPathRef.current === pagePath) {
      return
    }

    lastTrackedPathRef.current = pagePath
    window.gtag('event', 'page_view', {
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    })
  }, [hasConsent, pathname, trimmedMeasurementId])

  return null
}
