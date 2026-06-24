'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { safeBrowserSignOut } from '@/lib/auth/safe-browser-signout'
import { findPlanByAnyPriceId } from '@/constants'
import {
  getCountryOption,
  getJurisdictionOptions,
  SUPPORTED_COUNTRIES,
} from '@/lib/legal/jurisdictions'
import { getAppRouteForMarket } from '@/lib/markets/app-routes'
import { getPublicMarket, getPublicRouteForMarket } from '@/lib/markets/public-routes'
import styles from '@/app/auth/auth.module.css'

function parseName(fullName: string) {
  const normalized = fullName.trim().replace(/\s+/g, ' ')
  const [firstName, ...rest] = normalized.split(' ')
  return {
    normalized,
    firstName,
    lastName: rest.join(' '),
  }
}

function mapApiError(message: string) {
  const normalized = (message || '').toLowerCase()
  if (
    normalized.includes('leaked') ||
    normalized.includes('pwned') ||
    normalized.includes('compromised') ||
    normalized.includes('haveibeenpwned') ||
    (normalized.includes('password') && normalized.includes('breach'))
  ) {
    return 'This password appears in known data breaches. Choose a different one.'
  }
  if (normalized.includes('already') && normalized.includes('exists')) {
    return 'An account with this email already exists. Go to Sign In and use "Resend verification email".'
  }
  if (normalized.includes('password') && normalized.includes('stronger')) {
    return 'Please choose a stronger password.'
  }
  if (normalized.includes('email') && normalized.includes('valid')) {
    return 'That email address looks invalid. Double-check and try again.'
  }
  if (normalized.includes('verification email')) {
    return 'We could not send a verification email right now. Please try again.'
  }
  if (normalized.includes('already') && normalized.includes('registered')) {
    return 'An account with this email already exists. Go to Sign In and use "Resend verification email".'
  }
  return message || 'We could not create your account right now. Please try again.'
}

export default function SignUpForm() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [editingCountry, setEditingCountry] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    businessName: '',
    countryCode: '',
    jurisdictionCode: '',
  })
  const [geoHint, setGeoHint] = useState<{
    status: 'loading' | 'ready' | 'unsupported' | 'unavailable'
    message: string
  }>({
    status: 'loading',
    message: 'Checking your connection to suggest the legal-matter country...',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedPlanId = (searchParams?.get('planId') || '').trim()
  const selectedPlanName = (searchParams?.get('plan') || '').trim()
  const selectedPlan = findPlanByAnyPriceId(selectedPlanId)
  const resolvedSelectedPlanName = selectedPlanName || selectedPlan?.name || ''
  const audienceParam = (
    searchParams?.get('audience') ||
    searchParams?.get('billingAudience') ||
    searchParams?.get('accountType') ||
    ''
  ).trim().toLowerCase()
  const isBusinessPlan = ['solo'].includes(resolvedSelectedPlanName.toLowerCase())
  const isBusinessSignup = audienceParam === 'business' || isBusinessPlan
  const redirectParam = (searchParams?.get('redirect') || '').trim()
  const signupSourceParam = (searchParams?.get('signupSource') || '').trim().toLowerCase()
  const isAssistantPlanSelection = resolvedSelectedPlanName.toLowerCase().startsWith('assistant ')
  const isAssistantSignup =
    redirectParam === '/assistant' ||
    redirectParam.startsWith('/assistant/') ||
    signupSourceParam === 'assistant' ||
    isAssistantPlanSelection
  const publicMarket = getPublicMarket({
    pathname: redirectParam || pathname,
    explicitMarket: searchParams?.get('market'),
  })
  const termsHref = getPublicRouteForMarket('/terms', publicMarket)
  const privacyPolicyHref = getPublicRouteForMarket('/privacy-policy', publicMarket)
  const fallbackRedirect = isBusinessSignup
    ? '/business/dashboard'
    : selectedPlanId
    ? getAppRouteForMarket(`/dashboard?activatePlan=${encodeURIComponent(selectedPlanId)}`, publicMarket)
    : getAppRouteForMarket('/dashboard', publicMarket)
  const nextRedirect =
    redirectParam.startsWith('/')
      ? redirectParam
      : fallbackRedirect
  const selectedCountry = getCountryOption(formData.countryCode)
  const jurisdictionOptions = getJurisdictionOptions(formData.countryCode)

  const shouldShowCountrySelect = editingCountry || !selectedCountry

  useEffect(() => {
    let cancelled = false

    if (isBusinessSignup || isAssistantSignup) {
      setGeoHint({
        status: 'ready',
        message: '',
      })
      return () => {
        cancelled = true
      }
    }

    const loadGeolocationSuggestion = async () => {
      try {
        const response = await fetch('/api/geo/legal-matter', { cache: 'no-store' })
        if (!response.ok) throw new Error('Failed to detect country')
        const payload = await response.json()
        if (cancelled) return

        const suggestedCountryCode =
          typeof payload?.suggestedCountryCode === 'string'
            ? payload.suggestedCountryCode
            : ''
        const suggestedJurisdictionCode =
          typeof payload?.suggestedJurisdictionCode === 'string'
            ? payload.suggestedJurisdictionCode
            : ''
        const detectedCountryName =
          typeof payload?.detectedCountryName === 'string'
            ? payload.detectedCountryName
            : ''

        if (suggestedCountryCode) {
          setFormData((current) => {
            if (current.countryCode || current.jurisdictionCode) return current
            return {
              ...current,
              countryCode: suggestedCountryCode,
              jurisdictionCode: suggestedJurisdictionCode,
            }
          })

          const countryLabel = getCountryOption(suggestedCountryCode)?.label || detectedCountryName || suggestedCountryCode
          setGeoHint({
            status: 'ready',
            message: `Based on your connection, we suggested ${countryLabel}. Please confirm it and choose the correct legal jurisdiction before continuing.`,
          })
          return
        }

        if (detectedCountryName) {
          setGeoHint({
            status: 'unsupported',
            message: `We detected ${detectedCountryName} from your connection. Please confirm the country and jurisdiction of the legal matter below.`,
          })
          return
        }

        setGeoHint({
          status: 'unavailable',
          message: 'We could not detect the legal-matter country from your connection, so please choose it manually below.',
        })
      } catch {
        if (cancelled) return
        setGeoHint({
          status: 'unavailable',
          message: 'We could not detect the legal-matter country from your connection, so please choose it manually below.',
        })
      }
    }

    void loadGeolocationSuggestion()

    return () => {
      cancelled = true
    }
  }, [isBusinessSignup, isAssistantSignup])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!acceptedTerms) {
      setError('Please accept the Terms and Privacy Policy to continue.')
      setLoading(false)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      setLoading(false)
      return
    }

    const trimmedName = formData.fullName.trim()
    if (!trimmedName) {
      setError('Full name is required')
      setLoading(false)
      return
    }

    if (!isBusinessSignup && !isAssistantSignup && !selectedCountry) {
      setError('Please select the country your legal matter is in.')
      setLoading(false)
      return
    }

    if (!isBusinessSignup && !isAssistantSignup && !jurisdictionOptions.some((option) => option.code === formData.jurisdictionCode)) {
      setError(`Please select your ${selectedCountry?.jurisdictionLabel.toLowerCase() || 'jurisdiction'}.`)
      setLoading(false)
      return
    }

    try {
      const supabase = getSupabaseBrowserClient()
      // If a previous unfinished account is still in session, clear it before creating a new one.
      await safeBrowserSignOut(supabase)

      const { normalized, firstName, lastName } = parseName(trimmedName)

      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim(),
          password: formData.password,
          fullName: normalized,
          firstName,
          lastName,
          businessName: isBusinessSignup ? formData.businessName.trim() : undefined,
          countryCode: isBusinessSignup || isAssistantSignup ? null : formData.countryCode,
          jurisdictionCode: isBusinessSignup || isAssistantSignup ? null : formData.jurisdictionCode,
          audience: isBusinessSignup ? 'business' : 'litigant',
          plan: resolvedSelectedPlanName,
          planId: selectedPlanId || undefined,
          signupSource: isAssistantSignup ? 'assistant' : undefined,
          market: publicMarket,
          redirect: nextRedirect,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(mapApiError(payload?.message || payload?.error || 'Sign up failed'))
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email.trim(),
        password: formData.password,
      })

      if (signInError) {
        if (selectedPlanId) {
          throw new Error('Account created, but we could not start payment. Please sign in and continue from pricing.')
        }
        const signInParams = new URLSearchParams({ verify: 'sent', redirect: nextRedirect })
        router.push(`/auth/signin?${signInParams.toString()}`)
        router.refresh()
        return
      }

      const verifyParams = new URLSearchParams({
        verify: 'sent',
        redirect: nextRedirect,
      })
      if (selectedPlanId) verifyParams.set('planId', selectedPlanId)
      router.push(`/auth/verify-email?${verifyParams.toString()}`)
      router.refresh()
    } catch (err: any) {
      if (err instanceof Error) {
        setError(err.message || 'An error occurred during sign up')
      } else {
        setError('An unexpected error occurred during sign up')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && (
        <div className={styles.errorBox}>
          {error}
        </div>
      )}

      <div>
        <label htmlFor="fullName" className={styles.label}>
          Full Name
        </label>
        <input
          type="text"
          id="fullName"
          required
          className={styles.input}
          value={formData.fullName}
          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
        />
      </div>

      {isBusinessSignup && (
        <div>
          <label htmlFor="businessName" className={styles.label}>
            Business Name <span className={styles.optionalLabel}>(Optional)</span>
          </label>
          <input
            type="text"
            id="businessName"
            className={styles.input}
            value={formData.businessName}
            onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
            placeholder="McKenzieCS Legal Support"
          />
        </div>
      )}

      <div>
        <label htmlFor="email" className={styles.label}>
          Email
        </label>
        <input
          type="email"
          id="email"
          required
          className={styles.input}
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
      </div>

      {!isBusinessSignup && !isAssistantSignup && (
        <>
          <div>
            <div className={styles.fieldHeader}>
              <label htmlFor="countryCode" className={styles.label}>
                Country of legal matter
              </label>
              {!shouldShowCountrySelect && selectedCountry && (
                <button
                  type="button"
                  className={styles.inlineTextButton}
                  onClick={() => setEditingCountry(true)}
                >
                  Change
                </button>
              )}
            </div>

            {shouldShowCountrySelect ? (
              <select
                id="countryCode"
                required
                className={styles.select}
                value={formData.countryCode}
                onChange={(e) => {
                  const nextCountryCode = e.target.value
                  setFormData({
                    ...formData,
                    countryCode: nextCountryCode,
                    jurisdictionCode: '',
                  })
                  setEditingCountry(false)
                }}
              >
                <option value="" disabled>
                  Select country
                </option>
                {SUPPORTED_COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="countryCode"
                type="text"
                className={styles.input}
                value={selectedCountry.label}
                readOnly
                aria-readonly="true"
              />
            )}
            <p className={styles.footnote}>{geoHint.message}</p>
          </div>

          <div>
            <label htmlFor="jurisdictionCode" className={styles.label}>
              {selectedCountry?.jurisdictionLabel || 'Jurisdiction'}
            </label>
            <select
              id="jurisdictionCode"
              required
              className={styles.select}
              value={formData.jurisdictionCode}
              disabled={!selectedCountry}
              onChange={(e) => setFormData({ ...formData, jurisdictionCode: e.target.value })}
            >
              <option value="" disabled>
                {selectedCountry ? `Select ${selectedCountry.jurisdictionLabel.toLowerCase()}` : 'Select country first'}
              </option>
              {jurisdictionOptions.map((jurisdiction) => (
                <option key={jurisdiction.code} value={jurisdiction.code}>
                  {jurisdiction.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div>
        <label htmlFor="password" className={styles.label}>
          Password
        </label>
        <div className={styles.passwordField}>
          <input
            type={showPassword ? 'text' : 'password'}
            id="password"
            required
            minLength={6}
            className={styles.input}
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword((prev) => !prev)}
            aria-pressed={showPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor="confirmPassword" className={styles.label}>
          Confirm Password
        </label>
        <div className={styles.passwordField}>
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            id="confirmPassword"
            required
            minLength={6}
            className={styles.input}
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            aria-pressed={showConfirmPassword}
            aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
          >
            {showConfirmPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <label className={styles.checkboxRow}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          required
        />
        <span>
          I understand and accept the{' '}
          <a className={styles.inlineLink} href={termsHref} target="_blank" rel="noreferrer">
            Terms &amp; Conditions
          </a>{' '}
          and{' '}
          <a className={styles.inlineLink} href={privacyPolicyHref} target="_blank" rel="noreferrer">
            Privacy Policy
          </a>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={loading || !acceptedTerms}
        className={styles.primaryButton}
      >
        {loading
          ? (selectedPlanId ? 'Preparing checkout...' : 'Creating account...')
          : (selectedPlanId ? 'Continue to payment' : 'Sign Up')}
      </button>
    </form>
  )
}
