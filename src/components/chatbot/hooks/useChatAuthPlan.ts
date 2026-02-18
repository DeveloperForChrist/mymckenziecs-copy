"use client"

import { useEffect, useRef, useState } from 'react'

type WelcomeVariant = 'new' | 'returning' | null

type SupabaseLike = {
  auth: {
    getUser: () => Promise<any>
    onAuthStateChange: (callback: (...args: any[]) => void) => {
      data: {
        subscription: {
          unsubscribe: () => void
        }
      }
    }
  }
}

type UseChatAuthPlanArgs = {
  supabase: SupabaseLike
  clearSessionHistory: (userId?: string | null) => void
}

export function useChatAuthPlan({ supabase, clearSessionHistory }: UseChatAuthPlanArgs) {
  const [supabaseUser, setSupabaseUser] = useState<any>(null)
  const [plan, setPlan] = useState<string | null>(null)
  const [planLoaded, setPlanLoaded] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoaded, setAuthLoaded] = useState(false)
  const [welcomeVariant, setWelcomeVariant] = useState<WelcomeVariant>(null)
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadPlanForSession = async (nextUserId: string | null) => {
      if (!nextUserId) {
        if (cancelled) return
        setPlan('Free')
        setPlanLoaded(true)
        return
      }
      try {
        const response = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' })
        if (!response.ok) throw new Error('Failed to load subscription plan')
        const data = await response.json()
        if (cancelled) return
        const fetchedPlan = (data?.plan || 'Free').toString().trim()
        setPlan(fetchedPlan)
      } catch (error: unknown) {
        if (!cancelled) {
          console.error('Failed to load subscription plan:', error)
          setPlan('Free')
        }
      } finally {
        if (!cancelled) {
          setPlanLoaded(true)
        }
      }
    }

    const checkAuth = async () => {
      try {
        const { data } = await supabase.auth.getUser()
        const user = data?.user
        const nextUserId = user?.id || null
        const prevUserId = lastUserIdRef.current
        setSupabaseUser(user)
        setIsAuthenticated(Boolean(nextUserId))
        lastUserIdRef.current = nextUserId

        if (!user) {
          if (prevUserId) {
            clearSessionHistory(prevUserId)
            lastUserIdRef.current = null
          }
          setWelcomeVariant(null)
          await loadPlanForSession(null)
          return
        }

        if (typeof window !== 'undefined') {
          const welcomeKey = `chatbotWelcomeSeen:${user.id}`
          const hasSeen = localStorage.getItem(welcomeKey) === 'true'
          setWelcomeVariant(hasSeen ? 'returning' : 'new')
          if (!hasSeen) {
            localStorage.setItem(welcomeKey, 'true')
          }
        } else {
          setWelcomeVariant('returning')
        }

        await loadPlanForSession(nextUserId)
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to resolve auth state:', error)
          setPlan('Free')
          setPlanLoaded(true)
        }
      } finally {
        if (!cancelled) {
          setAuthLoaded(true)
        }
      }
    }

    checkAuth()

    const authListener = supabase.auth.onAuthStateChange((...args: any[]) => {
      const session = args[1]
      const nextUserId = session?.user?.id || null
      const prevUserId = lastUserIdRef.current
      if (prevUserId && prevUserId !== nextUserId) {
        clearSessionHistory(prevUserId)
      }
      if (!nextUserId && prevUserId) {
        clearSessionHistory(prevUserId)
      }
      lastUserIdRef.current = nextUserId
      setSupabaseUser(session?.user || null)
      setIsAuthenticated(Boolean(session?.user))
      setAuthLoaded(true)
      setPlanLoaded(false)
      void loadPlanForSession(nextUserId)
    })
    const { data: { subscription } } = authListener

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase, clearSessionHistory])

  return {
    supabaseUser,
    plan,
    planLoaded,
    isAuthenticated,
    authLoaded,
    welcomeVariant,
  }
}
