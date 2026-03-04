'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { safeBrowserSignOut } from '@/lib/auth/safe-browser-signout'
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
  const searchParams = useSearchParams()
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedPlanId = (searchParams?.get('planId') || '').trim()
  const redirectParam = (searchParams?.get('redirect') || '').trim()
  const fallbackRedirect = selectedPlanId
    ? `/pricing?plan=${encodeURIComponent(selectedPlanId)}`
    : '/dashboard'
  const nextRedirect =
    redirectParam.startsWith('/')
      ? redirectParam
      : fallbackRedirect

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
          redirect: nextRedirect,
        }),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(mapApiError(payload?.message || payload?.error || 'Sign up failed'))
      }

      if (selectedPlanId) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email.trim(),
          password: formData.password,
        })

        if (signInError) {
          throw new Error('Account created, but we could not start payment. Please sign in and continue from pricing.')
        }

        const verifyParams = new URLSearchParams({
          verify: 'sent',
          redirect: nextRedirect,
          planId: selectedPlanId,
        })
        router.push(`/auth/verify-email?${verifyParams.toString()}`)
        router.refresh()
        return
      }

      const signInParams = new URLSearchParams({ verify: 'sent', redirect: nextRedirect })
      router.push(`/auth/signin?${signInParams.toString()}`)
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
          <a className={styles.inlineLink} href="/terms" target="_blank" rel="noreferrer">
            Terms &amp; Conditions
          </a>{' '}
          and{' '}
          <a className={styles.inlineLink} href="/privacy-policy" target="_blank" rel="noreferrer">
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
