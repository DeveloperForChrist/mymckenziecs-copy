'use client'

import { useEffect, useState } from 'react'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'

type Status = 'verifying' | 'success' | 'error'

export default function VerifyEmailClient() {
  const [status, setStatus] = useState<Status>('verifying')
  const [message, setMessage] = useState<string>('Verifying your email…')

  useEffect(() => {
    let isMounted = true
    const supabase = getSupabaseBrowserClient()

    const verifyFromHash = async () => {
      if (typeof window === 'undefined') return false
      const hash = window.location.hash.replace(/^#/, '')
      if (!hash) return false
      const hashParams = new URLSearchParams(hash)
      const access_token = hashParams.get('access_token')
      const refresh_token = hashParams.get('refresh_token')
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token })
        if (error) throw error
        return true
      }
      return false
    }

    const verifyFromQuery = async () => {
      if (typeof window === 'undefined') return false
      const query = new URLSearchParams(window.location.search)
      const code = query.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) throw error
        return true
      }

      const tokenHash = query.get('token_hash') || query.get('token')
      const type = (query.get('type') || 'signup') as 'signup' | 'recovery' | 'email_change' | 'magiclink'
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        if (error) throw error
        return true
      }

      return false
    }

    const run = async () => {
      try {
        const hashVerified = await verifyFromHash()
        if (!hashVerified) {
          const queryVerified = await verifyFromQuery()
          if (!queryVerified) {
            throw new Error('Verification link is missing or invalid.')
          }
        }

        if (!isMounted) return
        setStatus('success')
        setMessage('Your email has been verified. You can now continue to your dashboard.')
      } catch (err: any) {
        if (!isMounted) return
        setStatus('error')
        setMessage(err?.message || 'We could not verify your email. Please request a new link.')
      }
    }

    run()
    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: '520px', width: '100%', background: '#111827', borderRadius: '16px', padding: '28px', border: '1px solid rgba(255,255,255,0.12)' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#f8fafc' }}>Email verification</h1>
        <p style={{ marginTop: '12px', color: '#cbd5f5' }}>{message}</p>
        <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
          <a href="/auth/signin" style={{ padding: '10px 16px', borderRadius: '10px', background: '#4c1d95', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
            Sign in
          </a>
          <a href="/dashboard" style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(255,255,255,0.12)', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
            Open dashboard
          </a>
        </div>
        {status === 'error' && (
          <p style={{ marginTop: '12px', fontSize: '0.9rem', color: '#fca5a5' }}>
            If this keeps happening, request a new verification link from support.
          </p>
        )}
      </div>
    </div>
  )
}
