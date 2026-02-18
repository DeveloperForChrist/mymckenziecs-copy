"use client"

import { useEffect } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { Message } from '@/components/chatbot/chat-types'

type UseFreemiumSessionHistoryArgs = {
  messages: Message[]
  setMessages: Dispatch<SetStateAction<Message[]>>
  isFreemiumPlan: boolean
  supabaseUserId: string | null | undefined
  clearSessionHistory: (userId?: string | null) => void
  getSessionHistoryKey: (userId: string) => string
}

export function useFreemiumSessionHistory({
  messages,
  setMessages,
  isFreemiumPlan,
  supabaseUserId,
  clearSessionHistory,
  getSessionHistoryKey
}: UseFreemiumSessionHistoryArgs) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isFreemiumPlan || !supabaseUserId) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('new')) {
      clearSessionHistory(supabaseUserId)
      return
    }
    if (messages.length > 0) return
    const raw = sessionStorage.getItem(getSessionHistoryKey(supabaseUserId))
    if (!raw) return
    try {
      const stored = JSON.parse(raw)
      if (Array.isArray(stored)) {
        const restored: Message[] = stored.map((msg: any) => ({
          id: `msg_${msg.timestamp || Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: typeof msg.content === 'string' ? msg.content : '',
          timestamp: new Date(msg.timestamp || Date.now())
        }))
        setMessages(restored)
      }
    } catch {
      // ignore invalid storage
    }
  }, [isFreemiumPlan, supabaseUserId, messages.length, clearSessionHistory, getSessionHistoryKey, setMessages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isFreemiumPlan || !supabaseUserId) return
    const payload = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : '',
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp || Date.now()).toISOString()
    }))
    sessionStorage.setItem(getSessionHistoryKey(supabaseUserId), JSON.stringify(payload))
  }, [messages, isFreemiumPlan, supabaseUserId, getSessionHistoryKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const payload = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : '',
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp || Date.now()).toISOString()
    }))
    window.dispatchEvent(new CustomEvent('sessionHistoryUpdated', { detail: { messages: payload } }))
  }, [messages])
}
