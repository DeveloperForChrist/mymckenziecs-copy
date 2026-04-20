import { describe, expect, it } from 'vitest'
import { readEdgeCountryCode } from '@/lib/legal/edge-country'
import { readStoredMarketCookie, resolveRootMarket } from '@/lib/markets/geo-routing'

describe('geo routing helpers', () => {
  it('prefers the signed-in profile market over cookie and edge hints', () => {
    expect(
      resolveRootMarket({
        profileCountryCode: 'US',
        storedMarket: 'GB',
        edgeCountryCode: 'GB',
      })
    ).toBe('US')
  })

  it('respects an explicit stored market before falling back to edge hints', () => {
    expect(
      resolveRootMarket({
        storedMarket: 'US',
        edgeCountryCode: 'GB',
      })
    ).toBe('US')

    expect(
      resolveRootMarket({
        storedMarket: 'GB',
        edgeCountryCode: 'US',
      })
    ).toBe('GB')
  })

  it('defaults anonymous visitors to GB unless the edge says US', () => {
    expect(
      resolveRootMarket({
        edgeCountryCode: 'US',
      })
    ).toBe('US')

    expect(
      resolveRootMarket({
        edgeCountryCode: 'GB',
      })
    ).toBe('GB')
  })

  it('normalizes stored market cookies', () => {
    expect(readStoredMarketCookie('us')).toBe('US')
    expect(readStoredMarketCookie('gb')).toBe('GB')
    expect(readStoredMarketCookie('')).toBeNull()
  })

  it('reads supported non-Vercel edge headers', () => {
    const headers = new Headers({
      'cf-ipcountry': 'us',
    })

    expect(readEdgeCountryCode(headers)).toBe('US')
  })

  it('ignores Vercel-only headers', () => {
    const headers = new Headers({
      'x-vercel-ip-country': 'US',
      'cf-ipcountry': 'CA',
    })

    expect(readEdgeCountryCode(headers)).toBeNull()
  })
})
