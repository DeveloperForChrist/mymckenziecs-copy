import { afterEach, describe, expect, it, vi } from 'vitest'
import { SearchTool } from './search-tool'

describe('search-tool source capture', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env.PERPLEXITY_API_KEY
  })

  it('keeps all successfully-read pages in output.sources', async () => {
    const pageHtml = (title: string, body: string) =>
      `<html><head><title>${title}</title></head><body>${body}</body></html>`

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.includes('search.brave.com/search')) {
        return new Response(
          `<html><body>
            <a href="https://example.com/page-a">Page A</a>
            <a href="https://example.com/page-b">Page B</a>
            <a href="https://example.com/page-c">Page C</a>
          </body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } }
        )
      }

      if (url === 'https://example.com/page-a') {
        return new Response(pageHtml('A', 'This page explains UK small claims process and CPR guidance.'), {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      if (url === 'https://example.com/page-b') {
        return new Response(pageHtml('B', 'This page explains legal timelines and court procedures in detail.'), {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      if (url === 'https://example.com/page-c') {
        return new Response(pageHtml('C', 'This page explains enforcement routes and hearing preparation.'), {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      return new Response('Not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const tool = new SearchTool()
    const raw = await tool._call(JSON.stringify({ query: 'uk court claim process', mode: 'general' }))
    const parsed = JSON.parse(raw) as { sources: string[]; reviewedCount: number }

    expect(parsed.reviewedCount).toBeGreaterThanOrEqual(2)
    expect(parsed.sources).toEqual([
      'https://example.com/page-a',
      'https://example.com/page-b',
      'https://example.com/page-c'
    ])
  })

  it('returns fallback mode with no citation sources when engines return no usable results', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.includes('search.brave.com/search')) {
        return new Response('<html><body></body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      return new Response('unavailable', { status: 503, headers: { 'content-type': 'text/plain' } })
    })

    vi.stubGlobal('fetch', fetchMock)

    const tool = new SearchTool()
    const raw = await tool._call(JSON.stringify({ query: 'driver hit my parked car england and did not stop', mode: 'general' }))
    const parsed = JSON.parse(raw) as { sources: string[]; reviewedCount: number; packet: string; sourceMode?: string }

    expect(parsed.reviewedCount).toBeGreaterThan(0)
    expect(parsed.sources).toEqual([])
    expect(parsed.sourceMode).toBe('fallback')
    expect(parsed.packet).toContain('fallback context only')
  })

  it('decomposes query into parallel sub-searches and merges unique URLs', async () => {
    const seenBraveQueries: string[] = []
    const pageHtml = (title: string, body: string) =>
      `<html><head><title>${title}</title></head><body>${body}</body></html>`

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.includes('search.brave.com/search')) {
        const parsedUrl = new URL(url)
        const q = parsedUrl.searchParams.get('q') || ''
        seenBraveQueries.push(q)

        if (q.includes('official legal sources')) {
          return new Response(
            `<html><body>
              <a href="https://example.com/guide-a">Guide A</a>
              <a href="https://example.com/guide-b">Guide B</a>
            </body></html>`,
            { status: 200, headers: { 'content-type': 'text/html' } }
          )
        }

        if (q.includes('England and Wales law official legal sources')) {
          return new Response(
            `<html><body>
              <a href="https://example.com/guide-b">Guide B Updated</a>
              <a href="https://example.com/guide-c">Guide C</a>
            </body></html>`,
            { status: 200, headers: { 'content-type': 'text/html' } }
          )
        }

        return new Response(
          `<html><body>
            <a href="https://example.com/guide-a">Guide A Base</a>
            <a href="https://example.com/guide-c">Guide C Base</a>
          </body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } }
        )
      }

      if (url === 'https://example.com/guide-a') {
        return new Response(pageHtml('Guide A', 'Driver obligations after an accident in England and Wales.'), {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      if (url === 'https://example.com/guide-b') {
        return new Response(pageHtml('Guide B', 'Reporting duties and insurance notifications after collision.'), {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      if (url === 'https://example.com/guide-c') {
        return new Response(pageHtml('Guide C', 'MIB route and limitation period overview.'), {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      return new Response('Not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const tool = new SearchTool()
    const raw = await tool._call(JSON.stringify({ query: 'driver hit my parked car and left scene', mode: 'general' }))
    const parsed = JSON.parse(raw) as { sources: string[]; packet: string; reviewedCount: number }

    expect(seenBraveQueries.length).toBeGreaterThanOrEqual(2)
    expect(seenBraveQueries.some((q) => q.includes('driver hit my parked car and left scene'))).toBe(true)
    expect(parsed.sources).toEqual([
      'https://example.com/guide-a',
      'https://example.com/guide-c'
    ])
    expect(parsed.reviewedCount).toBeGreaterThanOrEqual(2)
    expect(parsed.packet).toContain('Executed searches:')
    expect(parsed.packet).toContain('Matched query:')
  })

  it('uses Brave engine results without invoking non-Brave fallback providers', async () => {
    const pageHtml = (title: string, body: string) =>
      `<html><head><title>${title}</title></head><body>${body}</body></html>`

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.includes('search.brave.com/search')) {
        return new Response(
          `<html><body>
            <a href="https://www.legislation.gov.uk/ukpga/1988/52/section/170">Road Traffic Act 1988 section 170</a>
            <a href="https://www.mib.org.uk/making-a-claim/">MIB claims guidance</a>
          </body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } }
        )
      }

      if (url === 'https://www.legislation.gov.uk/ukpga/1988/52/section/170') {
        return new Response(pageHtml('Road Traffic Act 1988', 'Section 170 covers duties to stop and report after accidents.'), {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      if (url === 'https://www.mib.org.uk/making-a-claim/') {
        return new Response(pageHtml('MIB claim guidance', 'Motor Insurers Bureau process for untraced drivers.'), {
          status: 200,
          headers: { 'content-type': 'text/html' }
        })
      }

      return new Response('Not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const tool = new SearchTool()
    const raw = await tool._call(JSON.stringify({ query: 'driver hit parked car and left scene', mode: 'general' }))
    const parsed = JSON.parse(raw) as { sources: string[]; sourceMode?: string; reviewedCount: number }

    expect(parsed.sourceMode).toBe('engine')
    expect(parsed.reviewedCount).toBeGreaterThan(0)
    expect(parsed.sources).toContain('https://www.legislation.gov.uk/ukpga/1988/52/section/170')
    expect(parsed.sources).toContain('https://www.mib.org.uk/making-a-claim/')
    const usedNonBraveSearch = fetchMock.mock.calls.some(([arg]) => {
      const url = String(arg)
      return url.includes('bing.com/search?format=rss') || url.includes('duckduckgo.com')
    })
    expect(usedNonBraveSearch).toBe(false)
  })

  it('uses the Perplexity Search API when requested and skips page fetches', async () => {
    process.env.PERPLEXITY_API_KEY = 'perplexity-test-key'
    let perplexityBody: any = null

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://api.perplexity.ai/search') {
        perplexityBody = init?.body ? JSON.parse(String(init.body)) : null
        return new Response(
          JSON.stringify({
            results: [
              {
                url: 'https://www.gov.uk/employment-tribunals',
                title: 'Employment tribunals',
                snippet: 'Government guidance on making a claim to an employment tribunal.',
                date: '2026-02-15',
              },
              {
                url: 'https://www.acas.org.uk/early-conciliation',
                title: 'Early conciliation',
                snippet: 'ACAS explains when early conciliation is required before a tribunal claim.',
                date: '2025-11-20',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      return new Response('unexpected page fetch', { status: 500 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const tool = new SearchTool({ engine: 'perplexity' })
    const raw = await tool._call(JSON.stringify({ query: 'employment tribunal early conciliation', mode: 'procedure' }))
    const parsed = JSON.parse(raw) as { sources: string[]; sourceMode?: string; packet: string; reviewedCount: number }

    expect(parsed.sourceMode).toBe('engine')
    expect(parsed.reviewedCount).toBe(2)
    expect(parsed.sources).toEqual([
      'https://www.gov.uk/employment-tribunals',
      'https://www.acas.org.uk/early-conciliation',
    ])
    expect(parsed.packet).toContain('Perplexity Search API')
    expect(Array.isArray(perplexityBody?.query)).toBe(true)
    expect(perplexityBody?.query).toContain('employment tribunal early conciliation')
    expect(perplexityBody?.max_results).toBe(8)
    expect(perplexityBody?.max_tokens_per_page).toBe(512)
    expect(perplexityBody?.country).toBe('GB')
    expect(perplexityBody).not.toHaveProperty('search_mode')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('labels Reddit and forum-style results as anecdotal community sources', async () => {
    process.env.PERPLEXITY_API_KEY = 'perplexity-test-key'

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url === 'https://api.perplexity.ai/search') {
        return new Response(
          JSON.stringify({
            results: [
              {
                url: 'https://www.reddit.com/r/LegalAdviceUK/comments/example/thread/',
                title: 'Similar small claims experience',
                snippet: 'People discuss practical experiences with small claims hearings.',
                date: '2026-01-10',
              },
              {
                url: 'https://www.gov.uk/make-court-claim-for-money',
                title: 'Make a court claim for money',
                snippet: 'Official government guidance on making a money claim.',
                date: '2026-02-15',
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      }

      return new Response('unexpected page fetch', { status: 500 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const tool = new SearchTool({ engine: 'perplexity' })
    const raw = await tool._call(JSON.stringify({ query: 'small claims hearing experience', mode: 'general' }))
    const parsed = JSON.parse(raw) as { packet: string; sources: string[] }

    expect(parsed.sources).toContain('https://www.reddit.com/r/LegalAdviceUK/comments/example/thread/')
    expect(parsed.packet).toContain('Anecdotal/community source')
    expect(parsed.packet).toContain('identify it transparently as Reddit/forum/community discussion')
    expect(parsed.packet).toContain('user reports or forum discussion')
    expect(parsed.packet).toContain('Do not rely on it for law, court procedure, forms, deadlines, rights, legal standards, or case authority')
    expect(parsed.packet).toContain('General web source')
  })

  it('keeps packet ranking query-driven without forced authority injection', async () => {
    const pageHtml = (title: string, body: string) =>
      `<html><head><title>${title}</title></head><body>${body}</body></html>`

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.includes('search.brave.com/search')) {
        return new Response(
          `<html><body>
            <a href="https://blog1.example.com/p1">p1</a>
            <a href="https://blog2.example.com/p2">p2</a>
            <a href="https://blog3.example.com/p3">p3</a>
            <a href="https://blog4.example.com/p4">p4</a>
            <a href="https://blog5.example.com/p5">p5</a>
            <a href="https://blog6.example.com/p6">p6</a>
            <a href="https://blog7.example.com/p7">p7</a>
            <a href="https://blog8.example.com/p8">p8</a>
            <a href="https://blog9.example.com/p9">p9</a>
            <a href="https://www.legislation.gov.uk/ukpga/1988/52/section/170">rta s170</a>
          </body></html>`,
          { status: 200, headers: { 'content-type': 'text/html' } }
        )
      }

      if (url.includes('blog') && url.includes('/p')) {
        return new Response(
          pageHtml(
            'Driver hit parked car obligations 2026',
            'Driver hit parked car left scene reporting obligations insurance claim process steps in England and Wales 2026.'
          ),
          { status: 200, headers: { 'content-type': 'text/html' } }
        )
      }

      if (url === 'https://www.legislation.gov.uk/ukpga/1988/52/section/170') {
        return new Response(
          pageHtml('Road Traffic Act section 170', 'Duties to stop and report after accidents.'),
          { status: 200, headers: { 'content-type': 'text/html' } }
        )
      }

      return new Response('Not found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const tool = new SearchTool()
    const raw = await tool._call(JSON.stringify({ query: 'driver hit parked car left scene england legal duties', mode: 'general' }))
    const parsed = JSON.parse(raw) as { packet: string; sourceMode?: string; reviewedCount: number }

    expect(parsed.sourceMode).toBe('engine')
    expect(parsed.reviewedCount).toBe(6)
    expect(parsed.packet).toContain('https://blog1.example.com/p1')
  })
})
