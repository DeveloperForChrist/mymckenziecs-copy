import { describe, expect, it } from 'vitest'
import ChatMessageList, { calculateVirtualMessageWindow } from '@/components/chatbot/ChatMessageList'
import type { Message } from '@/components/chatbot/chat-types'

describe('ChatMessageList virtualization helpers', () => {
  it('returns a bounded render window for long message lists', () => {
    expect(ChatMessageList).toBeTypeOf('function')

    const messages: Message[] = Array.from({ length: 100 }, (_, index) => ({
      id: `msg-${index + 1}`,
      role: index % 2 === 0 ? 'assistant' : 'user',
      content: `Message ${index + 1}`,
      timestamp: new Date(`2026-03-08T10:${String(index % 60).padStart(2, '0')}:00.000Z`),
    }))

    const measuredHeights = new Map<string, number>()
    messages.forEach((message) => {
      measuredHeights.set(`id:${message.id}`, 100)
    })

    const window = calculateVirtualMessageWindow({
      messages,
      measuredHeights,
      scrollTop: 5000,
      viewportHeight: 500,
    })

    expect(window.totalHeight).toBe(10000)
    expect(window.items.length).toBeGreaterThan(0)
    expect(window.items.length).toBeLessThan(messages.length)
    expect(window.items[0].index).toBeGreaterThan(0)
    expect(window.items.at(-1)?.index).toBeLessThan(messages.length - 1)
  })

  it('returns an empty window for an empty message list', () => {
    expect(
      calculateVirtualMessageWindow({
        messages: [],
        measuredHeights: new Map<string, number>(),
        scrollTop: 0,
        viewportHeight: 600,
      })
    ).toEqual({
      items: [],
      totalHeight: 0,
    })
  })
})
