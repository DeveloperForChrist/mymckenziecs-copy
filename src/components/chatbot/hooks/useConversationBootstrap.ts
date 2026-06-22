"use client"

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { Dispatch, SetStateAction } from 'react'
import type { AssistantMetadata, Message } from '@/components/chatbot/chat-types'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'
import { fetchConversationHistoryPage } from '@/lib/chat/history-client'
import { getAppMarketFromPathname, getAppRouteForMarket } from '@/lib/markets/app-routes'

type UseConversationBootstrapArgs = {
  normalizeUserId: (value?: string | null) => string | null
  generateUUID: () => string
  conversationHomeHref?: string
  setUserId: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<Message[]>>
  setConversationId: Dispatch<SetStateAction<string>>
  setHistoryCursor: Dispatch<SetStateAction<string | null>>
  setHasMoreHistory: Dispatch<SetStateAction<boolean>>
  setIsConversationBootstrapping: Dispatch<SetStateAction<boolean>>
}

export function useConversationBootstrap({
  normalizeUserId,
  generateUUID,
  conversationHomeHref,
  setUserId,
  setMessages,
  setConversationId,
  setHistoryCursor,
  setHasMoreHistory,
  setIsConversationBootstrapping
}: UseConversationBootstrapArgs) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchParamsKey = searchParams?.toString() || ''

  useEffect(() => {
    const conversationStorageKey = 'currentConversationId'
    const lastSignInAtStorageKey = 'chatbotLastSignInAt'
    const chatbotHref = conversationHomeHref || getAppRouteForMarket('/chatbot', getAppMarketFromPathname(pathname))
    let cancelled = false

    const loadMessagesForConversation = async (targetConversationId: string): Promise<number> => {
      try {
        const data = await fetchConversationHistoryPage({
          conversationId: targetConversationId,
        })

        if (Array.isArray(data.messages)) {
          const loadedMessages: Message[] = data.messages.map((msg) => ({
            ...msg,
            metadata:
              msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata)
                ? (msg.metadata as AssistantMetadata)
                : undefined
          }))
          if (!cancelled) {
            setMessages(loadedMessages)
            setHistoryCursor(data.nextCursor)
            setHasMoreHistory(data.hasMoreOlder)
          }
          return loadedMessages.length
        }
      } catch (error: any) {
        console.error('Failed to load conversation:', error)
      }
      return 0
    }

    const findFallbackConversationId = async (currentConversationId: string): Promise<string | null> => {
      try {
        const response = await fetch('/api/chat-history', { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !Array.isArray(data?.conversations)) return null
        const conversations = data.conversations as Array<{ id?: string }>
        if (conversations.some((item) => item?.id === currentConversationId)) return null
        const latestConversationId = conversations.find((item) => typeof item?.id === 'string')?.id || null
        return latestConversationId
      } catch {
        return null
      }
    }

    const claimAnonymousConversation = async (anonymousUserId: string, targetConversationId: string): Promise<boolean> => {
      try {
        const response = await fetch('/api/chat/claim-anonymous', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            anonymousUserId,
            conversationId: targetConversationId,
          }),
        })
        return response.ok
      } catch (error) {
        console.error('Failed to claim anonymous conversation:', error)
        return false
      }
    }

    const loadConversation = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const conversationId = urlParams.get('conversationId')
      const isNew = urlParams.get('new') === 'true'
      const isFreshConversation = isNew || urlParams.get('fresh') === 'true'
      const supabase = getSupabaseBrowserClient()
      const { data: authData } = await supabase.auth.getUser()
      const authUserId = authData?.user?.id || null
      const currentSignInAt = String(authData?.user?.last_sign_in_at || '').trim()

      let storedUserId = localStorage.getItem('userId')
      if (authUserId) {
        const previousUserId = storedUserId
        const previousConversationId = conversationId || localStorage.getItem(conversationStorageKey) || ''
        const previousSignInAt = localStorage.getItem(lastSignInAtStorageKey)
        const switchedFromGuest = Boolean(previousUserId && previousUserId.startsWith('anon_') && previousUserId !== authUserId)
        const claimedAnonymousConversation =
          switchedFromGuest && previousConversationId
            ? await claimAnonymousConversation(previousUserId as string, previousConversationId)
            : false
        storedUserId = authUserId
        localStorage.setItem('userId', storedUserId)
        setUserId(storedUserId)
        if (currentSignInAt) {
          localStorage.setItem(lastSignInAtStorageKey, currentSignInAt)
        } else {
          localStorage.removeItem(lastSignInAtStorageKey)
        }

        // Prevent stale thread carry-over after auth transitions unless a specific conversation is requested.
        const switchedAccounts = Boolean(previousUserId && !previousUserId.startsWith('anon_') && previousUserId !== storedUserId)
        const signedInAgain = Boolean(
          previousSignInAt &&
          currentSignInAt &&
          previousSignInAt !== currentSignInAt
        )
        if (!conversationId && !isFreshConversation && (switchedAccounts || signedInAgain || (switchedFromGuest && !claimedAnonymousConversation))) {
          setMessages([])
          setHistoryCursor(null)
          setHasMoreHistory(false)
          const newConversationId = generateUUID()
          setConversationId(newConversationId)
          localStorage.setItem(conversationStorageKey, newConversationId)
          return
        }
      } else if (!storedUserId) {
        localStorage.removeItem(lastSignInAtStorageKey)
        storedUserId = `anon_${generateUUID()}`
        localStorage.setItem('userId', storedUserId)
      } else {
        localStorage.removeItem(lastSignInAtStorageKey)
        const normalized = normalizeUserId(storedUserId)
        if (normalized && normalized !== storedUserId) {
          storedUserId = normalized
          localStorage.setItem('userId', storedUserId)
        }
      }
      setUserId(storedUserId)

      setMessages([])
      setHistoryCursor(null)
      setHasMoreHistory(false)

      const startFreshConversation = () => {
        setMessages([])
        setHistoryCursor(null)
        setHasMoreHistory(false)
        localStorage.removeItem(conversationStorageKey)
        const newConversationId = generateUUID()
        setConversationId(newConversationId)
        localStorage.setItem(conversationStorageKey, newConversationId)
        window.history.replaceState({}, '', chatbotHref)
        return newConversationId
      }

      if (isFreshConversation) {
        startFreshConversation()
        return
      }

      if (conversationId) {
        setConversationId(conversationId)
        localStorage.setItem(conversationStorageKey, conversationId)
        const loadedCount = await loadMessagesForConversation(conversationId)
        if (loadedCount === 0) {
          startFreshConversation()
        }
      } else {
        const storedConvId = localStorage.getItem(conversationStorageKey)
        if (storedConvId) {
          setConversationId(storedConvId)
          const loadedCount = await loadMessagesForConversation(storedConvId)
          if (loadedCount === 0) {
            const fallbackConversationId = await findFallbackConversationId(storedConvId)
            if (fallbackConversationId) {
              setConversationId(fallbackConversationId)
              localStorage.setItem(conversationStorageKey, fallbackConversationId)
              await loadMessagesForConversation(fallbackConversationId)
            } else {
              startFreshConversation()
            }
          }
        } else {
          startFreshConversation()
        }
      }
    }

    setIsConversationBootstrapping(true)
    loadConversation()
      .catch((error) => {
        console.error('Failed to bootstrap conversation state:', error)
      })
      .finally(() => {
        if (!cancelled) {
          setIsConversationBootstrapping(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    normalizeUserId,
    generateUUID,
    conversationHomeHref,
    setUserId,
    setMessages,
    setConversationId,
    setHistoryCursor,
    setHasMoreHistory,
    setIsConversationBootstrapping,
    pathname,
    searchParamsKey
  ])
}
