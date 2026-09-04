import { describe, expect, it } from 'vitest'
import { MAJOR_BURNS, burnOn, burnsToday, nextBurn, pacificDateOf } from './burns'

// The map announces these to a city standing in the dust. A burn named on the
// wrong night sends people across the playa for nothing.
describe('major burns', () => {
  it('is listed in chronological order, which nextBurn relies on', () => {
    const dates = MAJOR_BURNS.map(b => b.date)
    expect([...dates].sort()).toEqual(dates)
  })

  it('finds the burn happening on a given day', () => {
    expect(burnOn('2026-09-04')?.name).toBe('Titanic\'s End')
    expect(burnOn('2026-09-05')?.name).toBe('The Man')
    expect(burnOn('2026-09-03')).toBeNull() // a day with no headline burn
  })

  it('returns today\'s burn as the next one, not tomorrow\'s', () => {
    // Standing on the playa on the 4th, the burn you care about is tonight's.
    expect(nextBurn('2026-09-04')?.name).toBe('Titanic\'s End')
  })

  it('skips to the soonest burn on a day with none', () => {
    expect(nextBurn('2026-09-03')?.name).toBe('Titanic\'s End')
    expect(nextBurn('2026-08-01')?.name).toBe('The Wave')
  })

  it('goes quiet after the last burn rather than wrapping to next year', () => {
    expect(nextBurn('2026-09-07')).toBeNull()
    expect(nextBurn('2026-12-25')).toBeNull()
  })

  it('knows whether a burn is tonight', () => {
    const man = MAJOR_BURNS.find(b => b.name === 'The Man')!
    expect(burnsToday(man, '2026-09-05')).toBe(true)
    expect(burnsToday(man, '2026-09-04')).toBe(false)
  })

  it('reads the Pacific calendar day, not the local one', () => {
    // 06:00 UTC on the 5th is still the evening of the 4th on the playa —
    // exactly when someone is checking what burns tonight.
    expect(pacificDateOf(Date.parse('2026-09-05T06:00:00Z'))).toBe('2026-09-04')
    expect(pacificDateOf(Date.parse('2026-09-05T18:00:00Z'))).toBe('2026-09-05')
  })
})
