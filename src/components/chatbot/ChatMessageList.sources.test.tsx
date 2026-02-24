import { createRef } from 'react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ChatMessageList from '@/components/chatbot/ChatMessageList'
import type { Message, ParsedSection, SourceReference } from '@/components/chatbot/chat-types'

describe('ChatMessageList sources', () => {
  it('renders source numbers as clickable links when metadata.sources exists', () => {
    const sources: SourceReference[] = [
      { number: 1, title: 'Civil Procedure Rules', url: 'https://www.justice.gov.uk/courts/procedure-rules/civil' },
      { number: 2, title: 'Legislation', url: 'https://www.legislation.gov.uk/' },
    ]

    const messages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'CPR Part 7 governs how a claim is started [1].',
        timestamp: new Date('2026-02-18T10:00:00.000Z'),
        isTyping: false,
        metadata: { sources },
      },
    ]

    const parseAssistantResponse = (): ParsedSection[] => [
      {
        heading: null,
        lines: [{ kind: 'paragraph', text: 'CPR Part 7 governs how a claim is started [1].' }],
      },
    ]

    const { getByRole } = render(
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

    const sourceOne = getByRole('link', { name: '[1]' })
    const sourceTwo = getByRole('link', { name: '[2]' })

    expect(sourceOne).toHaveAttribute('href', sources[0].url)
    expect(sourceTwo).toHaveAttribute('href', sources[1].url)
    expect(sourceOne.closest('.user-copy-button')).toBeNull()
    expect(sourceTwo.closest('.user-copy-button')).toBeNull()
  })
})
