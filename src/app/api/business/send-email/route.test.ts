import { describe, expect, it } from 'vitest'
import { POST } from './route'

describe('business direct email route', () => {
  it('cannot be used as an alternate outbound email channel', async () => {
    const response = await POST()
    const body = await response.json()

    expect(response.status).toBe(410)
    expect(body).toMatchObject({
      secureMessageEndpoint: '/api/business/inbox/message',
    })
  })
})
