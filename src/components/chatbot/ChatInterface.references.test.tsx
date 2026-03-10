import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderMessageContent } from '@/components/chatbot/ChatInterface'

describe('ChatInterface reference links', () => {
  it('does not auto-link court form references', () => {
    render(<div>{renderMessageContent('Use form N244 or N142 if that is the right form.')}</div>)

    expect(screen.queryByRole('link', { name: 'N244' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'N142' })).not.toBeInTheDocument()
    expect(screen.getByText(/Use form N244 or N142 if that is the right form\./)).toBeInTheDocument()
  })

  it('does not auto-link legal references like CPR text', () => {
    render(<div>{renderMessageContent('CPR Part 7 explains how a claim is started.')}</div>)

    expect(screen.queryByRole('link', { name: 'CPR Part 7' })).not.toBeInTheDocument()
    expect(screen.getByText(/CPR Part 7 explains how a claim is started\./)).toBeInTheDocument()
  })

  it('does not link paper sizes that only look like form codes', () => {
    render(<div>{renderMessageContent('The statement should be on A4 paper with a margin on the left.')}</div>)

    expect(screen.queryByRole('link', { name: 'A4' })).not.toBeInTheDocument()
    expect(screen.getByText(/The statement should be on A4 paper with a margin on the left\./)).toBeInTheDocument()
  })

  it('still links explicit URLs', () => {
    render(<div>{renderMessageContent('Read more at https://www.gov.uk/make-court-claim-for-money')}</div>)

    const link = screen.getByRole('link', { name: 'https://www.gov.uk/make-court-claim-for-money' })
    expect(link).toHaveAttribute('href', 'https://www.gov.uk/make-court-claim-for-money')
  })
})
