import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatInterface from '@/components/chatbot/ChatInterface'

vi.mock('@/lib/database/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: null } }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: () => {},
          },
        },
      }),
    },
  }),
}))

vi.mock('@/components/chatbot/hooks/useChatAuthPlan', () => ({
  useChatAuthPlan: () => ({
    supabaseUser: null,
    plan: 'Guest',
    planStatus: 'guest',
    paidAccess: false,
    planLoaded: true,
    isAuthenticated: false,
    authLoaded: true,
    welcomeVariant: null,
  }),
}))

vi.mock('@/components/chatbot/hooks/useConversationBootstrap', () => ({
  useConversationBootstrap: () => {},
}))

describe('ChatInterface stream status replay', () => {
  beforeEach(() => {
    vi.useFakeTimers()

    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })

    const createStorageMock = () => {
      const store = new Map<string, string>()
      return {
        getItem: vi.fn((key: string) => store.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          store.set(key, String(value))
        }),
        removeItem: vi.fn((key: string) => {
          store.delete(key)
        }),
        clear: vi.fn(() => {
          store.clear()
        }),
      }
    }

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    })

    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      value: createStorageMock(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('holds a long-running inline stream status steady until the next stream event arrives', async () => {
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/api/chat') {
        throw new Error(`Unexpected fetch target: ${String(input)}`)
      }

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<ChatInterface />)

    const textarea = screen.getByPlaceholderText(
      'Talk about your issue, ask for explanations, or request procedural guidance...'
    )
    fireEvent.change(textarea, { target: { value: 'hello' } })

    const form = textarea.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)

    await act(async () => {
      await Promise.resolve()
    })

    expect(streamController).not.toBeNull()

    await act(async () => {
      streamController!.enqueue(
        encoder.encode(`${JSON.stringify({ type: 'status', message: 'Working' })}\n`)
      )
      await Promise.resolve()
    })

    const getRawStatusText = () =>
      container.querySelector('[aria-live="polite"] span')?.textContent || ''
    const getStatusText = () => getRawStatusText().replace(/[.\s]+$/g, '')
    const getStatusDots = () =>
      (container.querySelector('[data-status-dots="true"]')?.textContent || '').trim()

    expect(getStatusText().length).toBeGreaterThan(0)
    expect(getStatusText().length).toBeLessThan('Working'.length)

    const initialDots = getStatusDots()

    await act(async () => {
      vi.advanceTimersByTime(340)
      await Promise.resolve()
    })

    expect(getStatusText()).toBe('Working')
    expect(getStatusDots().length).toBeGreaterThan(0)

    await act(async () => {
      vi.advanceTimersByTime(500)
      await Promise.resolve()
    })

    expect(getStatusText()).toBe('Working')
    expect(getStatusDots()).not.toBe(initialDots)

    await act(async () => {
      vi.advanceTimersByTime(2200)
      await Promise.resolve()
    })

    expect(getStatusText()).toBe('Working')

    await act(async () => {
      streamController!.enqueue(
        encoder.encode(`${JSON.stringify({ type: 'done', payload: { response: 'Done' } })}\n`)
      )
      streamController!.close()
      await Promise.resolve()
    })

    expect(screen.getByText('Done')).toBeInTheDocument()
  }, 10000)

  it('renders heading and ordered structure before the streaming response completes', async () => {
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/api/chat') {
        throw new Error(`Unexpected fetch target: ${String(input)}`)
      }

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<ChatInterface />)

    const textarea = screen.getByPlaceholderText(
      'Talk about your issue, ask for explanations, or request procedural guidance...'
    )
    fireEvent.change(textarea, { target: { value: 'hello' } })

    const form = textarea.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)

    await act(async () => {
      await Promise.resolve()
    })

    expect(streamController).not.toBeNull()

    await act(async () => {
      streamController!.enqueue(
        encoder.encode(`${JSON.stringify({ type: 'delta', delta: 'Next steps\n\n1. File the claim form' })}\n`)
      )
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(600)
      await Promise.resolve()
    })

    expect(container.querySelector('.assistant-heading')).not.toBeNull()
    expect(container.querySelector('ol.assistant-list-ordered')).not.toBeNull()
    expect(screen.getByText('Next steps')).toBeInTheDocument()
    expect(screen.getByText('File the claim form')).toBeInTheDocument()

    await act(async () => {
      streamController!.enqueue(
        encoder.encode(`${JSON.stringify({ type: 'done', payload: { response: 'Next steps\n\n1. File the claim form' } })}\n`)
      )
      streamController!.close()
      await Promise.resolve()
    })
  })

  it('flushes streamed answer chunks quickly enough for paragraph and list structure to appear without character-by-character lag', async () => {
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/api/chat') {
        throw new Error(`Unexpected fetch target: ${String(input)}`)
      }

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<ChatInterface />)

    const textarea = screen.getByPlaceholderText(
      'Talk about your issue, ask for explanations, or request procedural guidance...'
    )
    fireEvent.change(textarea, { target: { value: 'hello' } })

    const form = textarea.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)

    await act(async () => {
      await Promise.resolve()
    })

    expect(streamController).not.toBeNull()

    await act(async () => {
      streamController!.enqueue(
        encoder.encode(
          `${JSON.stringify({
            type: 'delta',
            delta: 'Next steps\n\n1. File the claim form\n2. Serve the defendant\n\nIn short: Keep proof of service.',
          })}\n`
        )
      )
      await Promise.resolve()
    })

    await act(async () => {
      vi.advanceTimersByTime(100)
      await Promise.resolve()
    })

    expect(container.querySelector('.assistant-heading')).not.toBeNull()
    expect(container.querySelector('ol.assistant-list-ordered')).not.toBeNull()
    expect(screen.getByText('File the claim form')).toBeInTheDocument()
    expect(screen.getByText('Serve the defendant')).toBeInTheDocument()
    expect(screen.getByText('In short: Keep proof of service.')).toBeInTheDocument()
  })

  it('renders structure during streaming when replaying real provider chunk boundaries', async () => {
    const encoder = new TextEncoder()
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
    })

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/api/chat') {
        throw new Error(`Unexpected fetch target: ${String(input)}`)
      }

      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const { container } = render(<ChatInterface />)

    const textarea = screen.getByPlaceholderText(
      'Talk about your issue, ask for explanations, or request procedural guidance...'
    )
    fireEvent.change(textarea, { target: { value: 'hello' } })

    const form = textarea.closest('form')
    expect(form).not.toBeNull()
    fireEvent.submit(form!)

    await act(async () => {
      await Promise.resolve()
    })

    expect(streamController).not.toBeNull()

    const realProviderChunks = [
      'What',
      ' the',
      ' claim',
      ' form',
      ' does',
      '\n\n',
      'The',
      ' claim',
      ' form',
      ' provides',
      ' the',
      ' court',
      ' and',
      ' the',
      ' defendant',
      ' with',
      ' key',
      ' information',
      ' about',
      ' your',
      ' case',
      '.',
      ' This',
      ' includes',
      ':\n\n',
      '-',
      ' The',
      ' names',
      ' and',
      ' addresses',
      ' of',
      ' the',
      ' parties',
      ' involved',
      ' (',
      'the',
      ' claimant',
      ' and',
      ' the',
      ' defendant',
      ').\n',
      '-',
      ' The',
      ' details',
      ' of',
      ' what',
      ' you',
      '’re',
      ' claiming',
      ' for',
      ' (',
      'the',
      ' “',
      'brief',
      ' details',
      ' of',
      ' claim',
      '”',
      ').\n',
      '-',
      ' The',
      ' amount',
      ' of',
      ' money',
      ' claimed',
      ',',
      ' if',
      ' any',
      ',',
      ' or',
      ' the',
      ' remedy',
      ' you',
      ' want',
      '.',
    ]

    for (const chunk of realProviderChunks) {
      await act(async () => {
        streamController!.enqueue(
          encoder.encode(`${JSON.stringify({ type: 'delta', delta: chunk })}\n`)
        )
        await Promise.resolve()
      })
    }

    await act(async () => {
      vi.advanceTimersByTime(160)
      await Promise.resolve()
    })

    expect(container.querySelector('.assistant-heading')).not.toBeNull()
    expect(screen.getByText('What the claim form does')).toBeInTheDocument()
    expect(container.querySelector('ul.assistant-list')).not.toBeNull()
    expect(screen.getByText('The names and addresses of the parties involved (the claimant and the defendant).')).toBeInTheDocument()
    expect(screen.getByText('The amount of money claimed, if any, or the remedy you want.')).toBeInTheDocument()
  })
})
