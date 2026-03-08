"use client"

import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { buildAssistantPresentation } from '@/lib/chat/assistant-presentation'
import type { AssistantMetadata, Message } from '@/components/chatbot/chat-types'
import { getSupabaseBrowserClient } from '@/lib/database/supabase-browser'

type StoredMessage = {
  role: 'user' | 'assistant'
  message: string
  timestamp: string
  metadata?: AssistantMetadata
}

type UseConversationBootstrapArgs = {
  normalizeUserId: (value?: string | null) => string | null
  generateUUID: () => string
  setUserId: Dispatch<SetStateAction<string>>
  setMessages: Dispatch<SetStateAction<Message[]>>
  setConversationId: Dispatch<SetStateAction<string>>
  setIsConversationBootstrapping: Dispatch<SetStateAction<boolean>>
}

export function useConversationBootstrap({
  normalizeUserId,
  generateUUID,
  setUserId,
  setMessages,
  setConversationId,
  setIsConversationBootstrapping
}: UseConversationBootstrapArgs) {
  useEffect(() => {
    const conversationStorageKey = 'currentConversationId'
    const lastSignInAtStorageKey = 'chatbotLastSignInAt'
    let cancelled = false

    const loadMessagesForConversation = async (storedUserId: string, targetConversationId: string): Promise<number> => {
      try {
        const response = await fetch('/api/chat-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: storedUserId, sessionId: targetConversationId, limit: 400 })
        })

        const data = await response.json()
        if (response.ok && Array.isArray(data.messages)) {
          const loadedMessages: Message[] = data.messages.map((msg: StoredMessage) => {
            const baseMetadata =
              msg.metadata && typeof msg.metadata === 'object' && !Array.isArray(msg.metadata)
                ? msg.metadata
                : undefined
            const presentation =
              msg.role === 'assistant'
                ? baseMetadata?.presentation || buildAssistantPresentation(msg.message || '')
                : undefined
            const metadata =
              msg.role === 'assistant'
                ? (() => {
                    const nextMetadata = {
                      ...(baseMetadata || {}),
                      ...(presentation ? { presentation } : {}),
                    }
                    return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
                  })()
                : baseMetadata

            return {
              id: `msg_${msg.timestamp}_${Math.random().toString(36).slice(2, 6)}`,
              role: msg.role,
              content: msg.message,
              timestamp: new Date(msg.timestamp),
              metadata
            }
          })
          if (!cancelled) {
            setMessages(loadedMessages)
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

    const loadConversation = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const conversationId = urlParams.get('conversationId')
      const isNew = urlParams.get('new') === 'true'
      const supabase = getSupabaseBrowserClient()
      const { data: authData } = await supabase.auth.getUser()
      const authUserId = authData?.user?.id || null
      const currentSignInAt = String(authData?.user?.last_sign_in_at || '').trim()

      let storedUserId = localStorage.getItem('userId')
      if (authUserId) {
        const previousUserId = storedUserId
        const previousSignInAt = localStorage.getItem(lastSignInAtStorageKey)
        storedUserId = authUserId
        localStorage.setItem('userId', storedUserId)
        setUserId(storedUserId)
        if (currentSignInAt) {
          localStorage.setItem(lastSignInAtStorageKey, currentSignInAt)
        } else {
          localStorage.removeItem(lastSignInAtStorageKey)
        }

        // Prevent stale thread carry-over after auth transitions unless a specific conversation is requested.
        const switchedFromGuest = Boolean(previousUserId && previousUserId.startsWith('anon_') && previousUserId !== storedUserId)
        const switchedAccounts = Boolean(previousUserId && !previousUserId.startsWith('anon_') && previousUserId !== storedUserId)
        const signedInAgain = Boolean(
          previousSignInAt &&
          currentSignInAt &&
          previousSignInAt !== currentSignInAt
        )
        if (!conversationId && !isNew && (switchedFromGuest || switchedAccounts || signedInAgain)) {
          setMessages([])
          const newConversationId = generateUUID()
          setConversationId(newConversationId)
          localStorage.setItem(conversationStorageKey, newConversationId)
          return
        }
      } else if (!storedUserId) {
        localStorage.removeItem(lastSignInAtStorageKey)
        storedUserId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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

      if (isNew) {
        setMessages([])
        const newConversationId = generateUUID()
        setConversationId(newConversationId)
        localStorage.setItem(conversationStorageKey, newConversationId)
        window.history.replaceState({}, '', '/chatbot')
        return
      }

      if (conversationId) {
        setConversationId(conversationId)
        localStorage.setItem(conversationStorageKey, conversationId)
        await loadMessagesForConversation(storedUserId, conversationId)
      } else {
        const storedConvId = localStorage.getItem(conversationStorageKey)
        if (storedConvId) {
          setConversationId(storedConvId)
          const loadedCount = await loadMessagesForConversation(storedUserId, storedConvId)
          if (loadedCount === 0) {
            const fallbackConversationId = await findFallbackConversationId(storedConvId)
            if (fallbackConversationId) {
              setConversationId(fallbackConversationId)
              localStorage.setItem(conversationStorageKey, fallbackConversationId)
              await loadMessagesForConversation(storedUserId, fallbackConversationId)
            }
          }
        } else {
          const newConversationId = generateUUID()
          setConversationId(newConversationId)
          localStorage.setItem(conversationStorageKey, newConversationId)
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
    setUserId,
    setMessages,
    setConversationId,
    setIsConversationBootstrapping
  ])
}
