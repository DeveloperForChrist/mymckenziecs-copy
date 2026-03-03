'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthApiError } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import styles from '@/app/auth/auth.module.css'

function mapSupabaseError(error: AuthApiError) {
  const message = (error.message || '').toLowerCase()
  if (message.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please try again.'
  }
  if (message.includes('email not confirmed')) {
    return 'Please confirm your email address before signing in.'
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Too many attempts. Please wait a moment before trying again.'
  }
  return error.message || 'We could not sign you in. Please try again.'
}

export default function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const verifyState = (searchParams?.get('verify') || '').trim().toLowerCase()
  const verifiedState = (searchParams?.get('verified') || '').trim().toLowerCase()
  const billingOptOutState = (searchParams?.get('billing_opt_out') || '').trim().toLowerCase()
  const redirectParam = (searchParams?.get('redirect') || '').trim()
  const hasExplicitRedirect = redirectParam.startsWith('/')
  const nextPath = hasExplicitRedirect ? redirectParam : '/dashboard'
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setResendMessage('')
    setLoading(true)

    try {
      const supabase = getSupabaseBrowserClient()
      const { error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      })

      if (error) {
        throw error
      }

      if (hasExplicitRedirect) {
        router.push(nextPath)
        router.refresh()
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      if (err instanceof AuthApiError) {
        setError(mapSupabaseError(err))
      } else if (err instanceof Error) {
        setError(err.message || 'An error occurred during sign in')
      } else {
        setError('An unexpected error occurred during sign in')
      }
    } finally {
      setLoading(false)
    }
  }

  const showResendVerification =
    verifiedState === 'expired' ||
    verifiedState === 'invalid' ||
    verifyState === 'sent' ||
    error.toLowerCase().includes('confirm your email')

  const handleResendVerification = async () => {
    setResendMessage('')
    setError('')
    const email = formData.email.trim()
    if (!email) {
      setError('Enter your email first, then click resend verification.')
      return
    }

    setResendLoading(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          redirect: nextPath,
        }),
      })
      setResendMessage('If an unverified account exists for this email, a new verification link has been sent.')
    } catch {
      setResendMessage('If an unverified account exists for this email, a new verification link has been sent.')
    } finally {
      setResendLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {verifyState === 'sent' && (
        <div className={styles.successBox}>
          Verification email sent. Please check your inbox before signing in.
        </div>
      )}
      {verifiedState === 'success' && (
        <div className={styles.successBox}>
          Email verified. You can now sign in.
        </div>
      )}
      {verifiedState === 'expired' && (
        <div className={styles.errorBox}>
          Your verification link expired. Enter your email below and resend verification.
        </div>
      )}
      {verifiedState === 'invalid' && (
        <div className={styles.errorBox}>
          Verification link is invalid. Enter your email below and resend verification.
        </div>
      )}
      {billingOptOutState === 'success' && (
        <div className={styles.successBox}>
          Billing recovery reminders are now turned off for this account.
        </div>
      )}
      {billingOptOutState === 'invalid' && (
        <div className={styles.errorBox}>
          That opt-out link is invalid or expired.
        </div>
      )}
      {error && (
        <div className={styles.errorBox}>
          {error}
        </div>
      )}
      {resendMessage && (
        <div className={styles.successBox}>
          {resendMessage}
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

      <div>
        <div className={styles.fieldHeader}>
          <label htmlFor="password" className={styles.label}>
            Password
          </label>
          <a href="/auth/reset-password" className={styles.inlineLink}>
            Forgot password?
          </a>
        </div>
        <div className={styles.passwordField}>
          <input
            type={showPassword ? 'text' : 'password'}
            id="password"
            required
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

      <button
        type="submit"
        disabled={loading}
        className={styles.primaryButton}
      >
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      {showResendVerification && (
        <button
          type="button"
          disabled={resendLoading}
          className={styles.outlineButton}
          onClick={handleResendVerification}
        >
          {resendLoading ? 'Sending verification...' : 'Resend verification email'}
        </button>
      )}
    </form>
  )
}
