'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
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

      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
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

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && (
        <div className={styles.errorBox}>
          {error}
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
    </form>
  )
}
