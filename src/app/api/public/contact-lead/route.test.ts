import { afterEach, describe, expect, it, vi } from 'vitest'

describe('/api/public/contact-lead route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('submits PII only through the private marketplace RPC', async () => {
    const rpc = vi.fn(async () => ({ data: { leadCount: 4 }, error: null }))
    const from = vi.fn(() => {
      throw new Error('Public submissions must not write directly to a table')
    })

    vi.doMock('@/lib/database/supabase-server', () => ({
      supabaseAdmin: { rpc, from },
    }))
    vi.doMock('@/lib/utils/rate-limit', () => ({
      emailDailyRateLimiter: {},
      emailRateLimiter: {},
      getClientIp: vi.fn(() => '127.0.0.1'),
      rateLimit: vi.fn(async () => ({ success: true })),
      rateLimitExceededResponse: vi.fn(),
    }))

    const { POST } = await import('./route')
    const response = await POST(new Request('https://app.example.com/api/public/contact-lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Client',
        lastName: 'One',
        phone: '07123456789',
        email: 'CLIENT@example.com',
        dateOfBirth: '1990-01-02',
        details: 'Private case narrative',
        leadTraceId: 'trace-123',
      }),
    }) as any)

    expect(response.status).toBe(200)
    expect(from).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('submit_marketplace_enquiry', expect.objectContaining({
      p_client_name: 'Client One',
      p_email: 'client@example.com',
      p_phone: '07123456789',
      p_date_of_birth: '1990-01-02',
      p_full_details: 'Private case narrative',
    }))
  })
})
