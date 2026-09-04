import { describe, expect, it } from 'vitest'
import { ACTIVE_WINDOW_MINUTES, bucketOf, hourSeries, hourSlot } from './pulse'

// These decide what the admin panel claims about real people, so an off-by-one
// here reads as "nobody is using the map" on a night when plenty are.
describe('pulse bucketing', () => {
  it('collapses everything inside a minute onto one bucket', () => {
    const base = Date.parse('2026-09-04T12:34:00Z')
    expect(bucketOf(base).getTime()).toBe(base)
    expect(bucketOf(base + 59_999).getTime()).toBe(base)
    expect(bucketOf(base + 60_000).getTime()).toBe(base + 60_000)
  })

  it('floors rather than rounds, so a bucket never lands in the future', () => {
    const t = Date.parse('2026-09-04T12:34:59.999Z')
    expect(bucketOf(t).getTime()).toBeLessThanOrEqual(t)
  })

  it('honours a wider bucket when asked', () => {
    const base = Date.parse('2026-09-04T12:30:00Z')
    expect(bucketOf(base + 4 * 60_000, 5).getTime()).toBe(base)
    expect(bucketOf(base + 5 * 60_000, 5).getTime()).toBe(base + 5 * 60_000)
  })
})

describe('24-hour series', () => {
  const now = Date.parse('2026-09-04T12:34:56Z')

  it('ends with the hour we are in and runs oldest first', () => {
    const s = hourSeries(now)
    expect(s).toHaveLength(24)
    expect(s[23]).toBe(Date.parse('2026-09-04T12:00:00Z'))
    expect(s[0]).toBe(Date.parse('2026-09-03T13:00:00Z'))
    expect([...s].sort((a, b) => a - b)).toEqual(s)
  })

  it('places a timestamp in its hour', () => {
    const s = hourSeries(now)
    expect(hourSlot(now, s)).toBe(23)
    expect(hourSlot(Date.parse('2026-09-04T12:00:00Z'), s)).toBe(23)
    expect(hourSlot(Date.parse('2026-09-04T11:59:59Z'), s)).toBe(22)
    expect(hourSlot(s[0]!, s)).toBe(0)
  })

  it('rejects anything outside the window rather than clamping it', () => {
    const s = hourSeries(now)
    // clamping would pile a week of old rows onto the first bar
    expect(hourSlot(Date.parse('2026-09-01T00:00:00Z'), s)).toBe(-1)
    expect(hourSlot(Date.parse('2026-09-05T00:00:00Z'), s)).toBe(-1)
  })

  it('keeps the active window short enough to mean "now"', () => {
    expect(ACTIVE_WINDOW_MINUTES).toBeLessThanOrEqual(10)
  })
})
