'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  readAnalyticsConsent,
  revokeAnalyticsTracking,
  saveAnalyticsConsent,
  type AnalyticsConsentState,
} from '@/lib/analytics/consent'
import {
  getPublicMarket,
  getPublicRouteForMarket,
  type PublicMarket,
} from '@/lib/markets/public-routes'
import styles from './settingsPage.module.css'

type CookiePreferencesSectionProps = {
  measurementId?: string
  market?: PublicMarket
}

export default function CookiePreferencesSection({
  measurementId,
  market,
}: CookiePreferencesSectionProps) {
  const pathname = usePathname()
  const trimmedMeasurementId = measurementId?.trim() || ''
  const [consent, setConsent] = useState<AnalyticsConsentState | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const cookiePolicyHref = getPublicRouteForMarket(
    '/cookie-policy',
    getPublicMarket({ pathname, explicitMarket: market })
  )

  useEffect(() => {
    if (!trimmedMeasurementId) {
      return
    }

    setConsent(readAnalyticsConsent())
    setIsHydrated(true)
  }, [trimmedMeasurementId])

  if (!trimmedMeasurementId) {
    return null
  }

  const handleConsent = (analytics: boolean) => {
    const nextConsent = saveAnalyticsConsent(analytics)
    setConsent(nextConsent)

    if (!analytics) {
      revokeAnalyticsTracking(trimmedMeasurementId)
    }
  }

  const analyticsStatus = !consent
    ? 'No analytics choice saved yet.'
    : consent.analytics
      ? 'Analytics is currently enabled.'
      : 'Analytics is currently disabled.'

  return (
    <section className={styles.settingsSection}>
      <h2 className={styles.sectionHeading}>Cookie Preferences</h2>
      <p className={styles.desc}>
        Manage optional analytics cookies. Essential cookies still run because the
        platform cannot function without them.
      </p>
      <p className={styles.helpText} style={{ fontSize: '0.88rem' }}>
        {isHydrated ? analyticsStatus : 'Loading your current cookie choice...'}
      </p>
      <div className={styles.actionsRow} style={{ marginTop: '16px' }}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => handleConsent(true)}
        >
          Allow analytics
        </button>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => handleConsent(false)}
        >
          Disable analytics
        </button>
      </div>
      <p className={styles.helpText} style={{ marginTop: '12px' }}>
        More detail is available in the{' '}
        <Link href={cookiePolicyHref} style={{ textDecoration: 'underline' }}>
          Cookie Policy
        </Link>
        .
      </p>
    </section>
  )
}
