'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

export default function VerifyEmailScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [resendPending, setResendPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const status = useMemo(() => (searchParams?.get('status') || '').trim().toLowerCase(), [searchParams])
  const verify = useMemo(() => (searchParams?.get('verify') || '').trim().toLowerCase(), [searchParams])
  const redirectParam = useMemo(() => (searchParams?.get('redirect') || '').trim(), [searchParams])
  const planId = useMemo(() => (searchParams?.get('planId') || '').trim(), [searchParams])
  const postVerifyRedirect = useMemo(() => {
    if (redirectParam.startsWith('/')) return redirectParam
    if (planId) return `/pricing?plan=${encodeURIComponent(planId)}`
    return '/dashboard'
  }, [planId, redirectParam])
  const verifyCopy = useMemo(() => {
    if (postVerifyRedirect.startsWith('/pricing?plan=')) {
      return 'Open your inbox, click Verify email, then continue to secure checkout. After payment, you will be taken to your dashboard.'
    }
    return 'Open your inbox, click Verify email, and you will be taken straight to your unlocked dashboard.'
  }, [postVerifyRedirect])

  useEffect(() => {
    let cancelled = false

    const loadUser = async () => {
      try {
        const res = await fetch('/api/user', { credentials: 'include', cache: 'no-store' })
        if (res.status === 401) {
          if (!cancelled) {
            setUnauthorized(true)
            setLoading(false)
          }
          return
        }
        if (!res.ok) {
          throw new Error('Could not load account')
        }

        const payload = await res.json().catch(() => ({}))
        if (cancelled) return

        const isVerified = typeof payload?.emailVerified === 'boolean' ? payload.emailVerified : true
        const email = typeof payload?.email === 'string' ? payload.email : ''

        if (isVerified) {
          router.replace(postVerifyRedirect)
          return
        }

        setUserEmail(email)
        if (verify === 'sent') {
          setNotice('Verification email has been sent. Check your inbox and click the button to continue.')
        }
      } catch {
        if (!cancelled) {
          setNotice('Could not load verification status right now. Refresh and try again.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadUser()
    return () => {
      cancelled = true
    }
  }, [postVerifyRedirect, router, verify])

  const resendVerification = async () => {
    if (!userEmail || resendPending) return

    setNotice(null)
    setResendPending(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: userEmail,
          redirect: postVerifyRedirect,
        }),
      })
      setNotice('Verification email sent. Please check your inbox.')
    } catch {
      setNotice('Could not send verification email right now. Please try again shortly.')
    } finally {
      setResendPending(false)
    }
  }

  const statusMessage =
    status === 'expired'
      ? 'That verification link expired. Request a fresh link below.'
      : status === 'invalid'
        ? 'That verification link is invalid. Request a fresh link below.'
        : null

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at 20% 10%, rgba(147, 51, 234, 0.2), transparent 45%), radial-gradient(circle at 84% 14%, rgba(236, 72, 153, 0.14), transparent 42%), linear-gradient(180deg, #270427 0%, #1d0326 48%, #13021a 100%)',
        color: '#f8fafc',
        padding: '1.5rem',
      }}
    >
      <section
        style={{
          width: 'min(620px, 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(248, 250, 252, 0.15)',
          background: 'linear-gradient(160deg, rgba(17, 24, 39, 0.88), rgba(30, 41, 59, 0.78))',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.45)',
          padding: '2rem',
        }}
      >
        <p style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.75rem', color: '#f8a76f', margin: 0 }}>
          Verify Account
        </p>
        <h1 style={{ fontSize: '2rem', lineHeight: 1.1, margin: '0.6rem 0 0.9rem 0' }}>Verify your email to continue</h1>
        <p style={{ margin: 0, color: '#cbd5f5' }}>
          {verifyCopy}
        </p>

        {statusMessage && (
          <p style={{ marginTop: '1rem', color: '#fecaca' }}>{statusMessage}</p>
        )}

        {notice && (
          <p style={{ marginTop: '1rem', color: '#d1fae5' }}>{notice}</p>
        )}

        {loading ? (
          <p style={{ marginTop: '1rem', color: '#cbd5f5' }}>Checking account status...</p>
        ) : unauthorized ? (
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Link
              href={`/auth/signin?redirect=${encodeURIComponent(`/auth/verify-email?redirect=${encodeURIComponent(postVerifyRedirect)}`)}`}
              style={{
                textDecoration: 'none',
                padding: '0.7rem 1rem',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)',
                color: '#052a27',
                fontWeight: 700,
              }}
            >
              Sign in
            </Link>
          </div>
        ) : (
          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                void resendVerification()
              }}
              disabled={!userEmail || resendPending}
              style={{
                textDecoration: 'none',
                padding: '0.7rem 1rem',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #7bd4c9, #3aa79d)',
                color: '#052a27',
                border: 'none',
                fontWeight: 700,
                cursor: resendPending ? 'not-allowed' : 'pointer',
                opacity: resendPending ? 0.7 : 1,
              }}
            >
              {resendPending ? 'Sending verification...' : 'Resend verification email'}
            </button>
          </div>
        )}
      </section>
    </main>
  )
}
