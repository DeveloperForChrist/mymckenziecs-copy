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
  initialState?: InitialChatPlanState | null
}

export type InitialChatPlanState = {
  userId: string
  plan: string
  planStatus: string
  paidAccess: boolean
  platformAccess?: boolean
}

export function useChatAuthPlan({ supabase, clearSessionHistory, initialState = null }: UseChatAuthPlanArgs) {
  const initialUserId = initialState?.userId || null
  const hasInitialState = Boolean(initialUserId)
  const [supabaseUser, setSupabaseUser] = useState<any>(hasInitialState ? { id: initialUserId } : null)
  const [plan, setPlan] = useState<string | null>(hasInitialState ? initialState?.plan || 'No plan' : null)
  const [planStatus, setPlanStatus] = useState<string | null>(hasInitialState ? initialState?.planStatus || 'inactive' : null)
  const [paidAccess, setPaidAccess] = useState(hasInitialState ? Boolean(initialState?.paidAccess) : false)
  const [platformAccess, setPlatformAccess] = useState(
    hasInitialState ? Boolean(initialState?.platformAccess ?? initialState?.paidAccess) : false
  )
  const [planLoaded, setPlanLoaded] = useState(hasInitialState)
  const [isAuthenticated, setIsAuthenticated] = useState(hasInitialState)
  const [authLoaded, setAuthLoaded] = useState(hasInitialState)
  const [welcomeVariant, setWelcomeVariant] = useState<WelcomeVariant>(null)
  const lastUserIdRef = useRef<string | null>(initialUserId)

  useEffect(() => {
    let cancelled = false

    const loadPlanForSession = async (nextUserId: string | null, options?: { preferInitial?: boolean }) => {
      if (!nextUserId) {
        if (cancelled) return
        setPlan('Guest')
        setPlanStatus('guest')
        setPaidAccess(false)
        setPlatformAccess(false)
        setPlanLoaded(true)
        return
      }
      const canUseInitial =
        options?.preferInitial === true &&
        initialUserId !== null &&
        initialUserId === nextUserId &&
        hasInitialState
      if (canUseInitial) {
        if (cancelled) return
        setPlan((initialState?.plan || 'No plan').toString().trim())
        setPlanStatus((initialState?.planStatus || 'inactive').toString().trim().toLowerCase())
        setPaidAccess(Boolean(initialState?.paidAccess))
        setPlatformAccess(Boolean(initialState?.platformAccess ?? initialState?.paidAccess))
        setPlanLoaded(true)
        return
      }
      try {
        const response = await fetch('/api/user/plan', { credentials: 'include', cache: 'no-store' })
        if (!response.ok) throw new Error('Failed to load subscription plan')
        const data = await response.json()
        if (cancelled) return
        const fetchedPlan = (data?.plan || 'No plan').toString().trim()
        setPlan(fetchedPlan)
        setPlanStatus((data?.planStatus || 'inactive').toString().trim().toLowerCase())
        setPaidAccess(Boolean(data?.paidAccess))
        setPlatformAccess(Boolean(data?.platformAccess ?? data?.paidAccess))
      } catch (error: any) {
        if (!cancelled) {
          console.error('Failed to load subscription plan:', error)
          setPlan('No plan')
          setPlanStatus('inactive')
          setPaidAccess(false)
          setPlatformAccess(false)
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
          await loadPlanForSession(null, { preferInitial: true })
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

        await loadPlanForSession(nextUserId, { preferInitial: true })
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to resolve auth state:', error)
          setPlan('No plan')
          setPlanStatus('inactive')
          setPaidAccess(false)
          setPlatformAccess(false)
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
      const canUseInitial =
        Boolean(nextUserId) &&
        initialUserId !== null &&
        nextUserId === initialUserId &&
        hasInitialState
      if (!canUseInitial) {
        setPlanLoaded(false)
      }
      void loadPlanForSession(nextUserId, { preferInitial: true })
    })
    const { data: { subscription } } = authListener

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase, clearSessionHistory, hasInitialState, initialState, initialUserId])

  return {
    supabaseUser,
    plan,
    planStatus,
    paidAccess,
    platformAccess,
    planLoaded,
    isAuthenticated,
    authLoaded,
    welcomeVariant,
  }
}
