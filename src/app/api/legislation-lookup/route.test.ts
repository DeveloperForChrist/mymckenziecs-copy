import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, clearLegislationLookupCacheForTests } from '@/app/api/legislation-lookup/route'

describe('legislation lookup route', () => {
  beforeEach(() => {
    clearLegislationLookupCacheForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    clearLegislationLookupCacheForTests()
  })

  it('returns a direct legislation URL only when the target page matches the reference', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<a href="/ukpga/1988/50/contents">Housing Act 1988</a>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body><h1>Housing Act 1988</h1><p>Contents</p></body></html>',
      })

    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(
      new Request('http://localhost/api/legislation-lookup?title=Housing%20Act%201988')
    )
    const body = await response.json()

    expect(body.url).toBe('https://www.legislation.gov.uk/ukpga/1988/50/contents')
  })

  it('falls back to official legislation search when a candidate page cannot be verified', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<a href="/ukpga/1988/50/contents">Housing Act 1988</a>',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html><body><h1>Different legislation</h1><p>Unrelated page</p></body></html>',
      })

    vi.stubGlobal('fetch', fetchMock)

    const response = await GET(
      new Request('http://localhost/api/legislation-lookup?title=Housing%20Act%201988')
    )
    const body = await response.json()

    expect(body.url).toBe('https://www.legislation.gov.uk/all?title=Housing%20Act%201988')
  })
})
