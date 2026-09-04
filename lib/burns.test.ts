import { describe, expect, it } from 'vitest'
import { MAJOR_BURNS, burnCountdown, burnOn, burnsToday, nextBurn, pacificDateOf, upcomingBurn } from './burns'

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

// The countdown is the thing people read while deciding whether they have time
// to ride out there. Wrong by an hour is a wasted trip across the playa.
describe('burn countdown', () => {
  const titanic = MAJOR_BURNS.find(b => b.name === 'Titanic\'s End')!
  const at = Date.parse(titanic.at)

  it('every burn carries a parseable time', () => {
    for (const b of MAJOR_BURNS)
      expect(Number.isFinite(Date.parse(b.at))).toBe(true)
  })

  it('the stated time matches the date it is listed under', () => {
    for (const b of MAJOR_BURNS)
      expect(pacificDateOf(Date.parse(b.at))).toBe(b.date)
  })

  it('counts down in minutes under the hour', () => {
    expect(burnCountdown(titanic, at - 45 * 60_000).label).toBe('in 45m')
    expect(burnCountdown(titanic, at - 1 * 60_000).label).toBe('in 1m')
  })

  it('counts in hours and minutes under the day', () => {
    expect(burnCountdown(titanic, at - (5 * 60 + 12) * 60_000).label).toBe('in 5h 12m')
    expect(burnCountdown(titanic, at - 23 * 3600_000).label).toBe('in 23h 0m')
  })

  it('counts in days beyond that', () => {
    expect(burnCountdown(titanic, at - 48 * 3600_000).label).toBe('in 2 days')
    expect(burnCountdown(titanic, at - 24 * 3600_000).label).toBe('in 1 day')
  })

  it('says it is burning while it burns, then stops', () => {
    expect(burnCountdown(titanic, at).phase).toBe('burning')
    expect(burnCountdown(titanic, at + 60 * 60_000).phase).toBe('burning')
    expect(burnCountdown(titanic, at + 91 * 60_000).phase).toBe('over')
    expect(burnCountdown(titanic, at + 91 * 60_000).label).toBe('burned')
  })

  it('moves to the next burn only once the current one is done', () => {
    // mid-burn, Titanic's End is still the one you care about
    expect(upcomingBurn(at + 10 * 60_000)?.name).toBe('Titanic\'s End')
    // an hour and a half later it hands over to the Man
    expect(upcomingBurn(at + 95 * 60_000)?.name).toBe('The Man')
  })

  it('goes quiet after the last burn rather than looping', () => {
    const last = MAJOR_BURNS[MAJOR_BURNS.length - 1]!
    expect(upcomingBurn(Date.parse(last.at) + 3 * 3600_000)).toBeNull()
  })
})
