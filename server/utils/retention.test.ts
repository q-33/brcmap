import { describe, expect, it } from 'vitest'
import { RETENTION, retentionCutoffs } from './retention'

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0)
const DAY = 86_400_000

describe('retention cutoffs', () => {
  const c = retentionCutoffs(NOW)
  it('keeps pulse rows long enough for the 7-day admin view', () => {
    expect(RETENTION.pulseDays).toBeGreaterThanOrEqual(7)
    expect(NOW - c.pulse.getTime()).toBe(RETENTION.pulseDays * DAY)
  })
  it('purges direct messages a year on (decision 2026-10-05)', () => {
    expect(RETENTION.messageDays).toBe(365)
    expect(c.message.toISOString()).toBe('2025-10-05T12:00:00.000Z')
  })
  it('ends an idle location share within the day', () => {
    expect(RETENTION.connectionIdleHours).toBeLessThanOrEqual(24)
    expect(c.connectionIdle.getTime()).toBe(NOW - RETENTION.connectionIdleHours * 3_600_000)
  })
  it('closes rides left open across a season, so last year’s taillights stop', () => {
    expect(RETENTION.rideOpenDays).toBeLessThan(365)
    expect(c.rideOpen.getTime()).toBeLessThan(NOW)
  })
})
