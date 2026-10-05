import { describe, expect, it } from 'vitest'
import { dailySalt, visitorKey } from './pulse'

// This is the privacy promise in the migration and in lib/pulse.ts. If any of
// these stop holding, the claim in those comments becomes untrue.
describe('visitor key', () => {
  const S = 'test-secret'
  const IP = '203.0.113.9'
  const UA = 'Mozilla/5.0 (iPhone)'

  it('is stable for the same person on the same day', () => {
    expect(visitorKey(S, '2026-09-04', IP, UA)).toBe(visitorKey(S, '2026-09-04', IP, UA))
  })

  it('rotates at the playa date boundary, so nobody is followed across days', () => {
    expect(visitorKey(S, '2026-09-04', IP, UA)).not.toBe(visitorKey(S, '2026-09-05', IP, UA))
  })

  it('separates different people on the same day', () => {
    expect(visitorKey(S, '2026-09-04', IP, UA)).not.toBe(visitorKey(S, '2026-09-04', '198.51.100.4', UA))
    expect(visitorKey(S, '2026-09-04', IP, UA)).not.toBe(visitorKey(S, '2026-09-04', IP, 'Firefox'))
  })

  it('is worthless to anyone without the server secret', () => {
    expect(visitorKey(S, '2026-09-04', IP, UA)).not.toBe(visitorKey('other', '2026-09-04', IP, UA))
  })

  it('leaks neither the address nor the agent', () => {
    const k = visitorKey(S, '2026-09-04', IP, UA)
    expect(k).not.toContain(IP)
    expect(k).not.toContain('iPhone')
    expect(k).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe('daily salt', () => {
  it('is stable within a day and different across days', () => {
    expect(dailySalt('2026-09-04')).toBe(dailySalt('2026-09-04'))
    expect(dailySalt('2026-09-04')).not.toBe(dailySalt('2026-09-05'))
  })
  it('is random, not derived from anything configured', () => {
    expect(dailySalt('2026-09-06')).toMatch(/^[0-9a-f]{32}$/)
    expect(dailySalt('2026-09-06')).not.toBe(dailySalt('2026-09-07'))
  })
  it('forgets days older than yesterday', () => {
    const a = dailySalt('2027-01-01')
    dailySalt('2027-01-02')
    dailySalt('2027-01-03')
    // asking again mints a NEW salt: the old one is gone, so nothing can be replayed
    expect(dailySalt('2027-01-01')).not.toBe(a)
  })
})
