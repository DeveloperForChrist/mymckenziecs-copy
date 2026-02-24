"use client"

import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
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
    let cancelled = false

    const loadMessagesForConversation = async (storedUserId: string, targetConversationId: string) => {
      try {
        const response = await fetch('/api/chat-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: storedUserId, sessionId: targetConversationId })
        })

        const data = await response.json()
        if (response.ok && Array.isArray(data.messages)) {
          const loadedMessages: Message[] = data.messages.map((msg: StoredMessage) => ({
            id: `msg_${msg.timestamp}_${Math.random().toString(36).slice(2, 6)}`,
            role: msg.role,
            content: msg.message,
            timestamp: new Date(msg.timestamp),
            metadata: msg.metadata
          }))
          setMessages(loadedMessages)
          const userMessageCount = loadedMessages.filter((msg) => msg.role === 'user').length
          if (targetConversationId && userMessageCount > 0 && typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('premiumThreadMessageCountChanged', {
                detail: { conversationId: targetConversationId, count: userMessageCount }
              })
            )
          }
        }
      } catch (error: unknown) {
        console.error('Failed to load conversation:', error)
      }
    }

    const loadConversation = async () => {
      const urlParams = new URLSearchParams(window.location.search)
      const conversationId = urlParams.get('conversationId')
      const isNew = urlParams.get('new')
      const supabase = getSupabaseBrowserClient()
      const { data: authData } = await supabase.auth.getUser()
      const authUserId = authData?.user?.id || null

      let storedUserId = localStorage.getItem('userId')
      if (authUserId) {
        const previousUserId = storedUserId
        storedUserId = authUserId
        localStorage.setItem('userId', storedUserId)
        setUserId(storedUserId)

        // Prevent guest thread/counter carry-over after sign-in unless a specific conversation is requested.
        const switchedFromGuest = Boolean(previousUserId && previousUserId.startsWith('anon_') && previousUserId !== storedUserId)
        if (!conversationId && !isNew && switchedFromGuest) {
          setMessages([])
          const newConversationId = generateUUID()
          setConversationId(newConversationId)
          localStorage.setItem(conversationStorageKey, newConversationId)
          window.dispatchEvent(
            new CustomEvent('premiumThreadMessageCountChanged', {
              detail: { conversationId: newConversationId, count: 0 }
            })
          )
          return
        }
      } else if (!storedUserId) {
        storedUserId = `anon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        localStorage.setItem('userId', storedUserId)
      } else {
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
          await loadMessagesForConversation(storedUserId, storedConvId)
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
