'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [authState, setAuthState] = useState<'checking' | 'authenticated'>('checking')

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (!data.session?.user) {
        router.replace('/')
        return
      }
      setAuthState('authenticated')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (!session?.user) {
        router.replace('/')
        return
      }
      setAuthState('authenticated')
    })

    return () => {
      cancelled = true
      listener?.subscription?.unsubscribe()
    }
  }, [router])

  if (authState === 'checking') {
    return null
  }

  return <>{children}</>
}
