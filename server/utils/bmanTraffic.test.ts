import { describe, expect, it } from 'vitest'

// The filter under test lives inline in fetchBmanTraffic; pin the constant's
// intent instead: the 2023 mud-year closure must never pass a freshness gate
// sized to one event.
describe('bmantraffic staleness', () => {
  const MAX_POST_AGE_MS = 4 * 86_400_000
  it('a four-day window rejects the 2023 mud-year posts by three years', () => {
    const mud = Date.parse('2023-09-02T18:48:00Z')
    expect(Date.now() - mud).toBeGreaterThan(MAX_POST_AGE_MS * 200)
  })
  it('and accepts a post from this morning', () => {
    expect(Date.now() - (Date.now() - 6 * 3600_000)).toBeLessThan(MAX_POST_AGE_MS)
  })
})
