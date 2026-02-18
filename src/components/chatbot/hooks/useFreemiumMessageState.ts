"use client"

import { useEffect } from 'react'
import type { Message } from '@/components/chatbot/chat-types'

type UseFreemiumMessageStateArgs = {
  messages: Message[]
  isGuestFreePlan: boolean
  isGuestLimitReached: boolean
  isFreemiumPlan: boolean
  planLoaded: boolean
  caseId: string
  guestMessageLimit: number
  freemiumMessageCount: number
  freemiumMessageLimit: number
  setIsGuestLimitReached: (value: boolean) => void
  setGuestLimitNotified: (value: boolean) => void
  setFreemiumMessageCount: (updater: number | ((prev: number) => number)) => void
  setShowGuestSignupModal: (value: boolean) => void
}

const getFreemiumStorageKey = () => 'freemiumMessageCount:__global__'

export function useFreemiumMessageState({
  messages,
  isGuestFreePlan,
  isGuestLimitReached,
  isFreemiumPlan,
  planLoaded,
  caseId,
  guestMessageLimit,
  freemiumMessageCount,
  freemiumMessageLimit,
  setIsGuestLimitReached,
  setGuestLimitNotified,
  setFreemiumMessageCount,
  setShowGuestSignupModal
}: UseFreemiumMessageStateArgs) {
  useEffect(() => {
    if (isGuestFreePlan) {
      const guestMessages = messages.filter(m => m.role === 'user').length
      setIsGuestLimitReached(guestMessages >= guestMessageLimit)
    } else {
      setIsGuestLimitReached(false)
    }
  }, [messages, isGuestFreePlan, guestMessageLimit, setIsGuestLimitReached])

  useEffect(() => {
    if (!isGuestLimitReached || !isGuestFreePlan) {
      setGuestLimitNotified(false)
    }
  }, [isGuestLimitReached, isGuestFreePlan, setGuestLimitNotified])

  useEffect(() => {
    if (!isFreemiumPlan || typeof window === 'undefined') return
    const storageKey = getFreemiumStorageKey()
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = Number.parseInt(stored, 10)
      if (!Number.isNaN(parsed)) {
        setFreemiumMessageCount(Math.min(parsed, freemiumMessageLimit))
        return
      }
    }
    setFreemiumMessageCount(0)
  }, [caseId, isFreemiumPlan, freemiumMessageLimit, setFreemiumMessageCount])

  useEffect(() => {
    if (!isFreemiumPlan) {
      setFreemiumMessageCount(0)
    }
  }, [isFreemiumPlan, setFreemiumMessageCount])

  useEffect(() => {
    if (typeof window === 'undefined' || !planLoaded) return
    const storageKey = getFreemiumStorageKey()

    if (!isFreemiumPlan) {
      localStorage.removeItem(storageKey)
      window.dispatchEvent(
        new CustomEvent('freemiumMessageCountChanged', {
          detail: { count: 0, limit: freemiumMessageLimit }
        })
      )
      return
    }

    const boundedCount = Math.min(freemiumMessageCount, freemiumMessageLimit)
    localStorage.setItem(storageKey, String(boundedCount))
    window.dispatchEvent(
      new CustomEvent('freemiumMessageCountChanged', {
        detail: { count: boundedCount, limit: freemiumMessageLimit }
      })
    )
  }, [freemiumMessageCount, isFreemiumPlan, caseId, planLoaded, freemiumMessageLimit])

  useEffect(() => {
    if (!planLoaded) return
    if (!isFreemiumPlan && !isGuestFreePlan) return
    fetch('/api/message-count', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (typeof data?.count === 'number' && isFreemiumPlan) {
          setFreemiumMessageCount(Math.min(data.count, freemiumMessageLimit))
        }
        if (isGuestFreePlan && typeof data?.limit === 'number' && typeof data?.count === 'number') {
          const reached = data.count >= data.limit
          setIsGuestLimitReached(reached)
          if (reached) setShowGuestSignupModal(true)
        }
      })
      .catch(() => undefined)
  }, [
    planLoaded,
    isFreemiumPlan,
    isGuestFreePlan,
    caseId,
    freemiumMessageLimit,
    setFreemiumMessageCount,
    setIsGuestLimitReached,
    setShowGuestSignupModal
  ])
}
