'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    const checkSession = async () => {
      try {
        const response = await fetch('/api/admin/session', { credentials: 'include' })
        const data = response.ok ? await response.json() : null
        if (!cancelled && data?.authenticated) {
          localStorage.setItem('adminLoggedIn', 'true')
          if (data?.email) localStorage.setItem('adminEmail', String(data.email))
          router.push('/jesusistheadmin/dashboard')
        }
      } catch {
        // ignore
      }
    }
    checkSession()
    return () => {
      cancelled = true
    }
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (!response.ok) {
        setError('Invalid email or password')
        setLoading(false)
        return
      }
      localStorage.setItem('adminLoggedIn', 'true')
      localStorage.setItem('adminEmail', email)
      router.push('/jesusistheadmin/dashboard')
    } catch {
      setError('Login failed. Please try again.')
      setLoading(false)
    }
  }

  const containerStyle: CSSProperties = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px'
  }

  const cardStyle: CSSProperties = {
    width: '100%',
    maxWidth: '440px',
    background: '#ffffff',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
  }

  const titleStyle: CSSProperties = {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '8px',
    textAlign: 'center'
  }

  const subtitleStyle: CSSProperties = {
    fontSize: '14px',
    color: '#6b7280',
    marginBottom: '32px',
    textAlign: 'center'
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    fontSize: '15px',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    marginBottom: '16px',
    outline: 'none',
    transition: 'border-color 0.2s'
  }

  const buttonStyle: CSSProperties = {
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#ffffff',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    border: 'none',
    borderRadius: '8px',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
    marginTop: '8px'
  }

  const errorStyle: CSSProperties = {
    padding: '12px',
    background: '#fee2e2',
    color: '#dc2626',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '16px',
    textAlign: 'center'
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Admin Panel</h1>
        <p style={subtitleStyle}>MymckenzieCS Administration</p>

        {error && <div style={errorStyle}>{error}</div>}

        <form onSubmit={handleLogin}>
          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#374151', marginBottom: '6px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              style={inputStyle}
            />
          </div>

          <button type="submit" disabled={loading} style={buttonStyle}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <a href="/" style={{ color: '#667eea', fontSize: '14px', textDecoration: 'none' }}>
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  )
}
