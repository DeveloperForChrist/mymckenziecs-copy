'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AuthApiError } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
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

function mapSupabaseError(error: AuthApiError) {
  const message = (error.message || '').toLowerCase()
  if (message.includes('already') && message.includes('registered')) {
    return 'An account with this email already exists.'
  }
  if (message.includes('password') && message.includes('short')) {
    return 'Please choose a stronger password.'
  }
  if (message.includes('email') && message.includes('invalid')) {
    return 'That email address looks invalid. Double-check and try again.'
  }
  return error.message || 'We could not create your account right now. Please try again.'
}

export default function SignUpForm() {
  const router = useRouter()
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
      const { normalized, firstName, lastName } = parseName(trimmedName)

      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: normalized,
            first_name: firstName,
            last_name: lastName,
            display_name: normalized
          }
        }
      })

      if (error) {
        throw error
      }

      try {
        await fetch('/api/user', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            fullName: normalized,
            firstName,
            lastName,
            email: data.user?.email || formData.email
          })
        })
      } catch {
        // no-op
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      if (err instanceof AuthApiError) {
        setError(mapSupabaseError(err))
      } else if (err instanceof Error) {
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
        {loading ? 'Creating account...' : 'Sign Up'}
      </button>
    </form>
  )
}
