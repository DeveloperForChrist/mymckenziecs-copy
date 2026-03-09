import { createRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ChatMessageList from '@/components/chatbot/ChatMessageList'
import type { Message, ParsedSection } from '@/components/chatbot/chat-types'

describe('ChatMessageList formatting', () => {
  it('renders ordered assistant items inside an ordered list from cached presentation metadata', () => {
    const messages: Message[] = [
      {
        id: 'assistant-ordered',
        role: 'assistant',
        content: 'ignored',
        timestamp: new Date('2026-03-08T08:30:00.000Z'),
        isTyping: false,
        metadata: {
          presentation: {
            version: 1,
            sections: [
              {
                heading: 'Next steps',
                lines: [
                  { kind: 'ordered', text: 'File the claim form' },
                  { kind: 'ordered', text: 'Serve the defendant' },
                ],
              },
            ],
          },
        },
      },
    ]

    const parseAssistantResponse = (): ParsedSection[] => {
      throw new Error('parseAssistantResponse should not be called for finished messages with cached presentation')
    }

    const { container, getByText } = render(
      <ChatMessageList
        messages={messages}
        feedbackState={{}}
        parseAssistantResponse={parseAssistantResponse}
        renderMessageContent={(content) => [content]}
        onCopyMessage={() => {}}
        formatAssistantResponse={(text) => text}
        onRegenerate={() => {}}
        onFeedback={() => {}}
        loading={false}
        loadingLabel={null}
        messagesEndRef={createRef<HTMLDivElement>()}
        StatusIndicatorComponent={() => <div>typing...</div>}
      />
    )

    const orderedList = container.querySelector('ol.assistant-list-ordered')
    expect(orderedList).not.toBeNull()
    expect(getByText('File the claim form')).toBeInTheDocument()
    expect(getByText('Serve the defendant')).toBeInTheDocument()
  })

  it('renders typing assistant messages with parsed headings, lists, and dividers', () => {
    const messages: Message[] = [
      {
        id: 'assistant-typing',
        role: 'assistant',
        content: 'Next steps\n\n1. File the claim form\n\n────────────────────\n\nIn short: Keep proof of service.',
        timestamp: new Date('2026-03-08T08:35:00.000Z'),
        isTyping: true,
      },
    ]

    const parseAssistantResponse = (text: string): ParsedSection[] => {
      expect(text).toContain('Next steps')
      return [
        {
          heading: 'Next steps',
          lines: [
            { kind: 'ordered', order: 1, text: 'File the claim form' },
          ],
        },
        {
          heading: null,
          lines: [{ kind: 'divider', text: '---' }],
        },
        {
          heading: null,
          lines: [{ kind: 'summary', text: 'In short: Keep proof of service.' }],
        },
      ]
    }

    const { container, getByText } = render(
      <ChatMessageList
        messages={messages}
        feedbackState={{}}
        parseAssistantResponse={parseAssistantResponse}
        renderMessageContent={(content) => [content]}
        onCopyMessage={() => {}}
        formatAssistantResponse={(text) => text}
        onRegenerate={() => {}}
        onFeedback={() => {}}
        loading={false}
        loadingLabel={null}
        messagesEndRef={createRef<HTMLDivElement>()}
        StatusIndicatorComponent={() => <div>typing...</div>}
      />
    )

    expect(container.querySelector('ol.assistant-list-ordered')).not.toBeNull()
    expect(container.querySelector('.assistant-heading')).not.toBeNull()
    expect(container.querySelector('.assistant-divider')).not.toBeNull()
    expect(getByText('File the claim form')).toBeInTheDocument()
    expect(getByText('In short: Keep proof of service.')).toBeInTheDocument()
  })

  it('renders inline stream status inside the assistant message area before answer text arrives', () => {
    const messages: Message[] = [
      {
        id: 'assistant-status',
        role: 'assistant',
        content: '',
        timestamp: new Date('2026-03-08T08:36:00.000Z'),
        isTyping: true,
        streamStatusLabel: 'Checking web sources...',
      },
    ]

    const parseAssistantResponse = (): ParsedSection[] => {
      throw new Error('parseAssistantResponse should not be called while the assistant is showing a stream status')
    }

    const { getByText, queryByText } = render(
      <ChatMessageList
        messages={messages}
        feedbackState={{}}
        parseAssistantResponse={parseAssistantResponse}
        renderMessageContent={(content) => [content]}
        onCopyMessage={() => {}}
        formatAssistantResponse={(text) => text}
        onRegenerate={() => {}}
        onFeedback={() => {}}
        loading={false}
        loadingLabel={null}
        messagesEndRef={createRef<HTMLDivElement>()}
        StatusIndicatorComponent={({ label }) => <div>{label}</div>}
      />
    )

    expect(getByText('Checking web sources')).toBeInTheDocument()
    expect(queryByText('Working')).toBeNull()
  })

  it('preserves ordered numbering when bullet detail appears between steps', () => {
    const messages: Message[] = [
      {
        id: 'assistant-numbering',
        role: 'assistant',
        content: 'ignored',
        timestamp: new Date('2026-03-08T08:40:00.000Z'),
        isTyping: false,
        metadata: {
          presentation: {
            version: 1,
            sections: [
              {
                heading: null,
                lines: [
                  { kind: 'ordered', order: 1, text: 'Gather all relevant documents' },
                  { kind: 'bullet', text: 'Employment contract and payslips.' },
                  { kind: 'ordered', order: 2, text: 'Check the qualifying period' },
                  { kind: 'bullet', text: 'Review your service dates.' },
                ],
              },
            ],
          },
        },
      },
    ]

    const { container, getByText } = render(
      <ChatMessageList
        messages={messages}
        feedbackState={{}}
        parseAssistantResponse={() => {
          throw new Error('parseAssistantResponse should not be called for finished messages with cached presentation')
        }}
        renderMessageContent={(content) => [content]}
        onCopyMessage={() => {}}
        formatAssistantResponse={(text) => text}
        onRegenerate={() => {}}
        onFeedback={() => {}}
        loading={false}
        loadingLabel={null}
        messagesEndRef={createRef<HTMLDivElement>()}
        StatusIndicatorComponent={() => <div>typing...</div>}
      />
    )

    const orderedItems = Array.from(container.querySelectorAll('li.assistant-list-item[value]'))
    expect(orderedItems).toHaveLength(2)
    expect(orderedItems[0]).toHaveAttribute('value', '1')
    expect(orderedItems[1]).toHaveAttribute('value', '2')
    expect(getByText('Gather all relevant documents')).toBeInTheDocument()
    expect(getByText('Check the qualifying period')).toBeInTheDocument()
  })
})
