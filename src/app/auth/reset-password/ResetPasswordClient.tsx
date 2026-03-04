'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import styles from '@/app/auth/auth.module.css'

export default function ResetPasswordClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const isRecoveryMode = searchParams?.get('type') === 'recovery'

  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [emailSuccess, setEmailSuccess] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showResetPassword, setShowResetPassword] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [canReset, setCanReset] = useState(false)
  const [checkingRecovery, setCheckingRecovery] = useState(isRecoveryMode)

  const mapPasswordUpdateError = (message: string) => {
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
    return message || 'We could not update your password. Please try again.'
  }

  useEffect(() => {
    if (!isRecoveryMode) {
      setCanReset(false)
      setCheckingRecovery(false)
      setResetError('')
      return
    }

    let mounted = true
    setCheckingRecovery(true)
    const supabase = getSupabaseBrowserClient()

    supabase.auth.getSession()
      .then(({ data }) => {
        if (!mounted) return
        const validSession = Boolean(data.session)
        setCanReset(validSession)
        if (!validSession) {
          setResetError('Your reset link is invalid or has expired. Request a new link below.')
        } else {
          setResetError('')
        }
      })
      .catch(() => {
        if (!mounted) return
        setCanReset(false)
        setResetError('We could not verify your reset link. Request a new one below.')
      })
      .finally(() => {
        if (!mounted) return
        setCheckingRecovery(false)
      })

    return () => {
      mounted = false
    }
  }, [isRecoveryMode])

  useEffect(() => {
    if (!resetSuccess) return
    const timer = setTimeout(() => {
      router.push('/auth/signin')
    }, 2000)
    return () => clearTimeout(timer)
  }, [resetSuccess, router])

  const handleResetEmail = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEmailError('')
    setEmailSuccess('')
    setEmailLoading(true)

    try {
      const res = await fetch('/api/email/password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json?.error || 'We could not send the reset email.')
      }

      setEmailSent(true)
      setEmailSuccess('Check your inbox for a link to set a new password. The link opens this page when clicked.')
    } catch (error: any) {
      setEmailError(error?.message || 'We could not send the reset email. Please try again in a moment.')
    } finally {
      setEmailLoading(false)
    }
  }

  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setResetError('')
    setResetSuccess('')

    if (newPassword.length < 8) {
      setResetError('Please choose a password that is at least 8 characters long.')
      return
    }

    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match.')
      return
    }

    setResetLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        setCanReset(false)
        throw new Error('Your reset link expired. Request a new one to continue.')
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        throw error
      }

      setResetSuccess('Password updated. Redirecting you to sign in...')
      setNewPassword('')
      setConfirmPassword('')
    } catch (error: any) {
      setResetError(mapPasswordUpdateError(error?.message || ''))
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <span className={styles.heroTag}>Account access</span>
          <div>
            <h1 className={styles.heroTitle}>Reset your password.</h1>
            <p className={styles.heroCopy}>
              Send yourself a secure reset link or, if you already clicked one, choose a new password to get back into
              your workspace.
            </p>
            <div className={styles.heroList}>
              <div className={styles.heroListItem}>
                <span>01</span>
                <div>We email you a time-limited link tied to your account.</div>
              </div>
              <div className={styles.heroListItem}>
                <span>02</span>
                <div>The link brings you back here to set a new password.</div>
              </div>
              <div className={styles.heroListItem}>
                <span>03</span>
                <div>Sign in again and keep working on your case prep.</div>
              </div>
            </div>
          </div>
          <div className={styles.heroFooter}>
            <span className={styles.pill}>Secure reset</span>
            <a href="/auth/signin">Sign in</a>
            <a href="/auth/signup">Create account</a>
          </div>
        </section>

        <section className={styles.formPanel}>
          <div>
            <h2 className={styles.formTitle}>
              {isRecoveryMode ? 'Choose a new password' : 'Forgot your password?'}
            </h2>
            <p className={styles.formSubtitle}>
              {isRecoveryMode
                ? 'Enter a new password below. Once saved, you will be redirected to sign in.'
                : 'Enter the email linked to your MyMcKenzieCS account and we will send you a reset link.'}
            </p>
          </div>

          {!isRecoveryMode && (
            <form onSubmit={handleResetEmail} className={styles.form}>
              {emailError && <div className={styles.errorBox}>{emailError}</div>}
              {emailSuccess && <div className={styles.successBox}>{emailSuccess}</div>}

              <div>
                <label htmlFor="reset-email" className={styles.label}>
                  Email address
                </label>
                <input
                  type="email"
                  id="reset-email"
                  required
                  className={styles.input}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <button type="submit" className={styles.submitButton} disabled={emailLoading}>
                {emailLoading ? 'Sending...' : 'Send reset link'}
              </button>
              {emailSent && (
                <p className={styles.helperText}>Didn&apos;t get an email? Check spam or try again.</p>
              )}
            </form>
          )}

          {isRecoveryMode && (
            <form onSubmit={handlePasswordUpdate} className={styles.form}>
              {resetError && <div className={styles.errorBox}>{resetError}</div>}
              {resetSuccess && <div className={styles.successBox}>{resetSuccess}</div>}

              <div>
                <label htmlFor="new-password" className={styles.label}>
                  New password
                </label>
                <div className={styles.passwordInput}>
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    id="new-password"
                    required
                    className={styles.input}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowResetPassword((prev) => !prev)}
                  >
                    {showResetPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className={styles.label}>
                  Confirm password
                </label>
                <div className={styles.passwordInput}>
                  <input
                    type={showResetConfirm ? 'text' : 'password'}
                    id="confirm-password"
                    required
                    className={styles.input}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowResetConfirm((prev) => !prev)}
                  >
                    {showResetConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className={styles.submitButton}
                disabled={resetLoading || checkingRecovery || !canReset}
              >
                {checkingRecovery ? 'Checking link...' : resetLoading ? 'Updating...' : 'Update password'}
              </button>
              {!canReset && !checkingRecovery && (
                <p className={styles.helperText}>Your reset link is invalid. Request a new one above.</p>
              )}
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
