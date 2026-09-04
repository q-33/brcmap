import { describe, expect, it } from 'vitest'
import { MAJOR_BURNS, burnOn, pacificDateOf } from './burns'

// The Events page prints these and the day-of banner announces them to a city
// standing in the dust. A burn named on the wrong night sends people across the
// playa for nothing.
describe('major burns', () => {
  it('is listed in chronological order, which the Events page prints as-is', () => {
    const dates = MAJOR_BURNS.map(b => b.date)
    expect([...dates].sort()).toEqual(dates)
  })

  it('finds the burn happening on a given day', () => {
    expect(burnOn('2026-09-04')?.name).toBe('Titanic\'s End')
    expect(burnOn('2026-09-05')?.name).toBe('The Man')
    expect(burnOn('2026-09-03')).toBeNull() // a day with no headline burn
  })





  it('reads the Pacific calendar day, not the local one', () => {
    // 06:00 UTC on the 5th is still the evening of the 4th on the playa —
    // exactly when someone is checking what burns tonight.
    expect(pacificDateOf(Date.parse('2026-09-05T06:00:00Z'))).toBe('2026-09-04')
    expect(pacificDateOf(Date.parse('2026-09-05T18:00:00Z'))).toBe('2026-09-05')
  })
})
