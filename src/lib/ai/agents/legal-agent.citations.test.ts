import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(async () => ({
          choices: [
            {
              message: { content: 'Main rule under CPR applies to this process.' },
              finish_reason: 'stop'
            }
          ]
        }))
      }
    }
  }

  return { default: MockOpenAI, OpenAI: MockOpenAI }
})

vi.mock('./discriminator-agent', () => ({
  createDiscriminatorAgent: vi.fn(async () => ({
    invoke: vi.fn(async ({ comprehensiveAnswer }: { comprehensiveAnswer: string }) => ({
      streamlinedAnswer: comprehensiveAnswer,
      citedSources: undefined
    }))
  })),
  createOrchestratorAgent: vi.fn(async () => ({
    invoke: vi.fn(async ({ comprehensiveAnswer }: { comprehensiveAnswer: string }) => ({
      streamlinedAnswer: comprehensiveAnswer,
      citedSources: undefined
    }))
  }))
}))

import { invokeLegalAgent } from './legal-agent'
import { SearchTool } from '../tools/search-tool'

describe('legal-agent citation mapping', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns all searched source URLs as citation metadata for premium flow', async () => {
    const mockSources = [
      'https://www.gov.uk/example-a',
      'https://www.justice.gov.uk/example-b',
      'https://www.legislation.gov.uk/example-c',
      'https://www.citizensadvice.org.uk/example-d'
    ]

    vi.spyOn(SearchTool.prototype, '_call').mockResolvedValue(
      JSON.stringify({
        query: 'test',
        mode: 'general',
        reviewedCount: mockSources.length,
        sources: mockSources,
        packet: 'Mocked retrieved context'
      })
    )

    const result = await invokeLegalAgent(
      'What is the process under CPR for this claim?',
      'thread_test',
      'user_test',
      [],
      '',
      { useDiscriminator: false, useSearch: true, includeCitations: true }
    )

    expect(result.sources).toBeDefined()
    expect(result.sources?.map((source) => source.url)).toEqual(mockSources)
    expect(result.response).not.toContain('Reference index:')
  })

  it('keeps citations in premium flow even when discriminator output has no citation tags', async () => {
    const mockSources = [
      'https://www.gov.uk/example-a',
      'https://www.justice.gov.uk/example-b',
      'https://www.legislation.gov.uk/example-c',
    ]

    vi.spyOn(SearchTool.prototype, '_call').mockResolvedValue(
      JSON.stringify({
        query: 'test',
        mode: 'general',
        reviewedCount: mockSources.length,
        sources: mockSources,
        packet: 'Mocked retrieved context'
      })
    )

    const result = await invokeLegalAgent(
      'A driver ran into my car. What should I do?',
      'thread_test_discriminator',
      'user_test',
      [],
      '',
      { useDiscriminator: true, useSearch: true, includeCitations: true }
    )

    expect(result.response).toMatch(/\[\d+\]/)
    expect(result.response).not.toContain('Reference index:')
    expect(result.sources?.map((source) => source.url)).toEqual(mockSources)
  })

  it('does not output citations when search is fallback-only (engine failure)', async () => {
    vi.spyOn(SearchTool.prototype, '_call').mockResolvedValue(
      JSON.stringify({
        query: 'test',
        mode: 'general',
        reviewedCount: 4,
        sources: [],
        packet: 'Fallback context gathered from curated sources.',
        sourceMode: 'fallback'
      })
    )

    const result = await invokeLegalAgent(
      'A driver ran into my car. What should I do?',
      'thread_test_fallback',
      'user_test',
      [],
      '',
      { useDiscriminator: true, useSearch: true, includeCitations: true }
    )

    expect(result.response).not.toMatch(/\[\d+\]/)
    expect(result.response).not.toContain('Reference index:')
    expect(result.sources).toBeUndefined()
  })
})
