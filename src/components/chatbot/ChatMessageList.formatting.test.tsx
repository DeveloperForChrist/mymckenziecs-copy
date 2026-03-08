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
        TypingIndicatorComponent={() => <div>typing...</div>}
      />
    )

    const orderedList = container.querySelector('ol.assistant-list-ordered')
    expect(orderedList).not.toBeNull()
    expect(getByText('File the claim form')).toBeInTheDocument()
    expect(getByText('Serve the defendant')).toBeInTheDocument()
  })

  it('renders typing assistant messages as raw plain text without parsing sections', () => {
    const messages: Message[] = [
      {
        id: 'assistant-typing',
        role: 'assistant',
        content: 'Next steps\n\n1. File the claim form',
        timestamp: new Date('2026-03-08T08:35:00.000Z'),
        isTyping: true,
      },
    ]

    const parseAssistantResponse = (): ParsedSection[] => {
      throw new Error('parseAssistantResponse should not be called while an assistant message is still typing')
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
        TypingIndicatorComponent={() => <div>typing...</div>}
      />
    )

    const typingParagraph = container.querySelector('p.assistant-paragraph')
    expect(typingParagraph).not.toBeNull()
    expect(typingParagraph?.textContent).toBe('Next steps\n\n1. File the claim form')
    expect(container.querySelector('ol.assistant-list-ordered')).toBeNull()
    expect(container.querySelector('.assistant-heading')).toBeNull()
  })
})
