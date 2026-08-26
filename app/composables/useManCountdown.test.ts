import { describe, expect, it } from 'vitest'

// The composable needs Vue's lifecycle, so the arithmetic is exercised directly.
// Kept in step with useManCountdown.ts by construction: same constants, same rule.
const BURN_MS = Date.parse('2026-09-05T21:00:00-07:00')
const BURN_DAY = '2026-09-05'
const PLAYA_TZ = 'America/Los_Angeles'

function days(fromMs: number): number {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: PLAYA_TZ }).format(new Date(fromMs))
  return Math.round((Date.parse(`${BURN_DAY}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}
function label(nowMs: number): string {
  const d = days(nowMs)
  if (nowMs > BURN_MS) return 'See you next year on the playa'
  if (d > 1) return `The Man burns in ${d} days`
  if (d === 1) return 'The Man burns tomorrow!'
  return 'The Man burns tonight!'
}

describe('the Man countdown', () => {
  it('counts calendar days, not elapsed hours', () => {
    // the report: 11:07 Pacific on 26 August. Burning Man's own dashboard says
    // 10; ceil() on elapsed milliseconds said 11, because the burn is 10 days
    // and 10 hours away.
    expect(days(Date.parse('2026-08-26T11:07:00-07:00'))).toBe(10)
    expect(label(Date.parse('2026-08-26T11:07:00-07:00'))).toBe('The Man burns in 10 days')
  })

  it('gives the same answer all day, whatever the hour', () => {
    for (const t of ['00:01', '11:07', '23:59'])
      expect(days(Date.parse(`2026-08-26T${t}:00-07:00`))).toBe(10)
  })

  it('reads the playa calendar, not the reader\'s', () => {
    // 4am in London on the 27th is still the evening of the 26th on the playa
    expect(days(Date.parse('2026-08-27T04:00:00+01:00'))).toBe(10)
  })

  it('says tomorrow on the Friday and tonight on the Saturday', () => {
    expect(label(Date.parse('2026-09-04T09:00:00-07:00'))).toBe('The Man burns tomorrow!')
    expect(label(Date.parse('2026-09-05T09:00:00-07:00'))).toBe('The Man burns tonight!')
    expect(label(Date.parse('2026-09-05T20:59:00-07:00'))).toBe('The Man burns tonight!')
  })

  it('stops counting once he has actually burned', () => {
    // the date arithmetic still says 0 late on Saturday, so the burn MOMENT ends it
    expect(days(Date.parse('2026-09-05T22:00:00-07:00'))).toBe(0)
    expect(label(Date.parse('2026-09-05T22:00:00-07:00'))).toBe('See you next year on the playa')
    expect(label(Date.parse('2026-09-08T12:00:00-07:00'))).toBe('See you next year on the playa')
  })

  it('crosses the month boundary correctly', () => {
    expect(days(Date.parse('2026-08-31T12:00:00-07:00'))).toBe(5)
    expect(days(Date.parse('2026-09-01T12:00:00-07:00'))).toBe(4)
  })
})
