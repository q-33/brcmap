import { describe, expect, it } from 'vitest'
import { WAIT_CHOICES, freshReports, fmtWait, medianWait } from './exodus'

// This number decides when tired people with pets and children get in the
// line. It errs coarse and honest, never precise and wrong.
describe('exodus wait math', () => {
  it('takes the median, so one optimist and one doomsayer cancel out', () => {
    const t = Date.now()
    expect(medianWait([
      { minutes: 30, at: t },
      { minutes: 240, at: t },
      { minutes: 250, at: t },
      { minutes: 260, at: t },
      { minutes: 700, at: t },
    ])).toBe(250)
  })

  it('averages the middle pair on an even count', () => {
    const t = Date.now()
    expect(medianWait([
      { minutes: 100, at: t },
      { minutes: 200, at: t },
    ])).toBe(150)
  })

  it('says nothing rather than something from nothing', () => {
    expect(medianWait([])).toBeNull()
  })

  it('formats at line precision, not clock precision', () => {
    expect(fmtWait(12)).toBe('10 min')
    expect(fmtWait(45)).toBe('45 min')
    expect(fmtWait(70)).toBe('1 h')
    expect(fmtWait(95)).toBe('1½ h')
    expect(fmtWait(110)).toBe('2 h')
    expect(fmtWait(370)).toBe('6 h')
  })

  it('drops stale reports — a two-hour-old wait is a different afternoon', () => {
    const now = Date.now()
    const fresh = freshReports([
      { minutes: 60, at: now - 30 * 60_000 },
      { minutes: 300, at: now - 3 * 3600_000 },
    ], now)
    expect(fresh).toHaveLength(1)
    expect(fresh[0]!.minutes).toBe(60)
  })

  it('offers coarse choices in strictly rising order', () => {
    const mins = WAIT_CHOICES.map(c => c.minutes)
    expect([...mins].sort((a, b) => a - b)).toEqual(mins)
    expect(mins[0]).toBeLessThan(60)
    expect(mins[mins.length - 1]!).toBeGreaterThanOrEqual(480)
  })
})
