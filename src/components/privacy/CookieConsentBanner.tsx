'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  revokeAnalyticsTracking,
  readAnalyticsConsent,
  saveAnalyticsConsent,
} from '@/lib/analytics/consent'

type CookieConsentBannerProps = {
  analyticsEnabled: boolean
  measurementId?: string
}

export default function CookieConsentBanner({
  analyticsEnabled,
  measurementId,
}: CookieConsentBannerProps) {
  const [isHydrated, setIsHydrated] = useState(false)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!analyticsEnabled) {
      return
    }

    setIsOpen(readAnalyticsConsent() === null)
    setIsHydrated(true)
  }, [analyticsEnabled])

  if (!analyticsEnabled || !isHydrated || !isOpen) {
    return null
  }

  const handleConsent = (analytics: boolean) => {
    saveAnalyticsConsent(analytics)
    setIsOpen(false)

    if (!analytics) {
      revokeAnalyticsTracking(measurementId)
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1200] p-3 sm:p-4">
      <div className="mx-auto max-w-3xl rounded-[28px] border border-white/15 bg-[linear-gradient(135deg,rgba(39,4,39,0.98),rgba(15,11,31,0.98))] p-5 text-white shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.22em] text-purple-200/80">Cookie controls</p>
            <h2 className="mt-2 text-xl font-semibold">Allow optional analytics?</h2>
            <p className="mt-2 text-sm leading-6 text-white/80">
              We use Google Analytics to understand which pages are used and where the
              product is failing. It stays off until you opt in, and you can change this
              later from Settings or the{' '}
              <Link href="/cookie-policy" className="underline decoration-white/40 underline-offset-4">
                Cookie Policy
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:min-w-[220px]">
            <button
              type="button"
              onClick={() => handleConsent(true)}
              className="rounded-full bg-white px-4 py-3 text-sm font-semibold text-[#17081f] transition hover:bg-white/90"
            >
              Allow analytics
            </button>
            <button
              type="button"
              onClick={() => handleConsent(false)}
              className="rounded-full border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Continue without analytics
            </button>
          </div>
        </div>
        <p className="mt-4 text-xs leading-5 text-white/60">
          Essential cookies still run because the platform cannot function without them.
        </p>
      </div>
    </div>
  )
}
