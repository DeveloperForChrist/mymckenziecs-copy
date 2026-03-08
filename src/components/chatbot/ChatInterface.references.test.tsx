import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderMessageContent } from '@/components/chatbot/ChatInterface'

describe('ChatInterface reference links', () => {
  it('sends court form references to GOV.UK search instead of legislation lookup', () => {
    render(<div>{renderMessageContent('Use form N244 or N142 if that is the right form.')}</div>)

    const n244 = screen.getByRole('link', { name: 'N244' })
    const n142 = screen.getByRole('link', { name: 'N142' })
    expect(n244).toHaveAttribute('href', 'https://www.gov.uk/search/all?keywords=N244')
    expect(n142).toHaveAttribute('href', 'https://www.gov.uk/search/all?keywords=N142')
  })

  it('keeps CPR references clickable when they can be resolved confidently', () => {
    render(<div>{renderMessageContent('CPR Part 7 explains how a claim is started.')}</div>)

    expect(screen.queryByRole('link', { name: 'CPR Part 7' })).not.toBeInTheDocument()
    expect(screen.getByText(/CPR Part 7 explains how a claim is started\./)).toBeInTheDocument()
  })
})
