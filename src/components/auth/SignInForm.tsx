'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthApiError } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { safeBrowserSignOut } from '@/lib/auth/safe-browser-signout'
import { getAppRouteForMarket } from '@/lib/markets/app-routes'
import { getPublicMarket } from '@/lib/markets/public-routes'
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

function isAssistantPlanLabel(plan: unknown) {
  return String(plan || '').trim().toLowerCase().startsWith('assistant ')
}

function navigateAfterAuth(path: string) {
  window.location.assign(path)
}

export default function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const invitationToken = (searchParams?.get('token') || '').trim()
  const verifyState = (searchParams?.get('verify') || '').trim().toLowerCase()
  const verifiedState = (searchParams?.get('verified') || '').trim().toLowerCase()
  const billingOptOutState = (searchParams?.get('billing_opt_out') || '').trim().toLowerCase()
  const redirectParam = (searchParams?.get('redirect') || '').trim()
  const publicMarket = getPublicMarket({
    pathname: redirectParam,
    explicitMarket: searchParams?.get('market'),
  })
  const defaultDashboardHref = getAppRouteForMarket('/dashboard', publicMarket)
  const businessDashboardHref = '/business/dashboard'
  const clientPortalHref = '/client-portal'
  const nextPath = redirectParam.startsWith('/') ? redirectParam : defaultDashboardHref
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [activeSessionEmail, setActiveSessionEmail] = useState('')
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const [invitation, setInvitation] = useState<null | { invitedEmail: string; businessName?: string | null }>(null)

  useEffect(() => {
    let cancelled = false
    const loadSession = async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        const { data } = await supabase.auth.getUser()
        if (!cancelled) {
          setActiveSessionEmail(data?.user?.email || '')
        }
      } catch {
        if (!cancelled) setActiveSessionEmail('')
      }
    }
    void loadSession()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    if (!invitationToken) {
      setInvitation(null)
      return () => {
        cancelled = true
      }
    }

    const loadInvitation = async () => {
      try {
        const response = await fetch(`/api/client/invitations?token=${encodeURIComponent(invitationToken)}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || !payload?.invitation) {
          throw new Error(payload?.message || 'Invalid or expired invitation link.')
        }
        if (cancelled) return
        setInvitation(payload.invitation)
        setFormData((current) => ({
          ...current,
          email: String(payload.invitation.invitedEmail || current.email || '').trim(),
        }))
      } catch (err) {
        if (cancelled) return
        setInvitation(null)
        setError(err instanceof Error ? err.message : 'Invalid or expired invitation link.')
      }
    }

    void loadInvitation()

    return () => {
      cancelled = true
    }
  }, [invitationToken])

  const handleUseDifferentAccount = async () => {
    setError('')
    setResendMessage('')
    setSwitchingAccount(true)
    try {
      const supabase = getSupabaseBrowserClient()
      await safeBrowserSignOut(supabase)
      setActiveSessionEmail('')
      setFormData({ email: '', password: '' })
      router.refresh()
    } catch {
      setError('Could not switch account right now. Please refresh and try again.')
    } finally {
      setSwitchingAccount(false)
    }
  }

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

      if (invitationToken) {
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token
        if (!accessToken) {
          throw new Error('Please sign in again to finish opening your client portal.')
        }

        const inviteResponse = await fetch('/api/client/invitations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ token: invitationToken }),
        })
        const invitePayload = await inviteResponse.json().catch(() => ({}))
        if (!inviteResponse.ok) {
          if (inviteResponse.status === 403) {
            await safeBrowserSignOut(supabase)
          }
          throw new Error(invitePayload?.message || 'Failed to accept invitation.')
        }
      }

      let isVerified = true
      let accountType = 'litigant'
      let hasBusinessWorkspace = false
      let hasClientPortalAccess = false
      let preferredProduct: string | null = null
      try {
        const verificationRes = await fetch('/api/user', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (verificationRes.ok) {
          const verificationPayload = await verificationRes.json().catch(() => ({}))
          isVerified =
            typeof verificationPayload?.emailVerified === 'boolean'
              ? verificationPayload.emailVerified
              : true
          accountType = String(verificationPayload?.accountType || 'litigant').trim().toLowerCase()
          hasBusinessWorkspace = Boolean(verificationPayload?.hasBusinessWorkspace)
          hasClientPortalAccess = Boolean(verificationPayload?.hasClientPortalAccess)
          preferredProduct = typeof verificationPayload?.preferredProduct === 'string'
            ? verificationPayload.preferredProduct.trim().toLowerCase()
            : null
        }
      } catch {
        // Fail open to avoid blocking verified users on transient API issues.
        isVerified = true
      }

      const isBusinessAccount = accountType === 'business' || hasBusinessWorkspace
      const hasExplicitRedirect = redirectParam.startsWith('/')
      const isDashboardRedirect =
        nextPath === defaultDashboardHref ||
        nextPath === '/dashboard' ||
        nextPath.startsWith('/dashboard?') ||
        nextPath === '/us/dashboard' ||
        nextPath.startsWith('/us/dashboard?')
      let hasPaidPlan = false
      let planLabel = 'No plan'
      try {
        const planRes = await fetch('/api/user/plan', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (planRes.ok) {
          const planPayload = await planRes.json().catch(() => ({}))
          hasPaidPlan = Boolean(planPayload?.paidAccess)
          planLabel = String(planPayload?.plan || 'No plan')
        }
      } catch {
        hasPaidPlan = false
      }

      const isAssistantAccount = preferredProduct === 'assistant' || isAssistantPlanLabel(planLabel)
      const accountDashboardHref = (() => {
        if (invitationToken) return clientPortalHref
        if (hasExplicitRedirect) return nextPath
        if (isBusinessAccount && isDashboardRedirect) return businessDashboardHref
        if (hasClientPortalAccess && !isBusinessAccount && isDashboardRedirect) return clientPortalHref
        if (!isBusinessAccount && !hasClientPortalAccess && isAssistantAccount && isDashboardRedirect) return '/assistant'
        return nextPath
      })()

      if (!isVerified) {
        const verifyRedirectTarget = accountDashboardHref
        const verifyRedirect = `/auth/verify-email?redirect=${encodeURIComponent(verifyRedirectTarget)}`
        navigateAfterAuth(verifyRedirect)
        return
      }

      if (!hasPaidPlan) {
        navigateAfterAuth(accountDashboardHref)
        return
      }

      const verifiedRedirect = accountDashboardHref.startsWith('/auth/verify-email')
        ? (isBusinessAccount ? businessDashboardHref : isAssistantAccount ? '/assistant' : defaultDashboardHref)
        : accountDashboardHref
      navigateAfterAuth(verifiedRedirect)
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
      {invitation && (
        <div className={styles.successBox}>
          {invitation.businessName
            ? `Sign in with ${invitation.invitedEmail} to open ${invitation.businessName}'s client portal.`
            : `Sign in with ${invitation.invitedEmail} to open your client portal.`}
        </div>
      )}
      {activeSessionEmail && (
        <div className={styles.successBox}>
          Signed in as <strong>{activeSessionEmail}</strong>. Need another email?{' '}
          <button
            type="button"
            onClick={() => { void handleUseDifferentAccount() }}
            disabled={switchingAccount}
            className={styles.inlineTextButton}
          >
            {switchingAccount ? 'Switching...' : 'Use a different account'}
          </button>
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
          disabled={Boolean(invitation?.invitedEmail)}
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
        {loading ? 'Signing in...' : invitation ? 'Sign in and open portal' : 'Sign In'}
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
