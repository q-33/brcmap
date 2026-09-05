import { describe, expect, it } from 'vitest'
import { bearingDeg, distanceMeters, fmtAge, fmtDistance } from './rides'

// Two people are walking toward each other across a dusty city on these
// numbers. Wrong by a factor is a missed pickup.
describe('rendezvous math', () => {
  const man = { lat: 40.7864, lng: -119.2065 }
  const temple = { lat: 40.7912, lng: -119.1965 } // ~1 km NE of the Man

  it('measures the Man-to-Temple walk at about a kilometre', () => {
    const d = distanceMeters(man, temple)
    expect(d).toBeGreaterThan(900)
    expect(d).toBeLessThan(1150)
  })

  it('is zero at zero and symmetric', () => {
    expect(distanceMeters(man, man)).toBe(0)
    expect(distanceMeters(man, temple)).toBeCloseTo(distanceMeters(temple, man), 6)
  })

  it('points north-east from the Man to the Temple', () => {
    const b = bearingDeg(man, temple)
    expect(b).toBeGreaterThan(30)
    expect(b).toBeLessThan(75)
  })

  it('reverses to the opposite quadrant on the way back', () => {
    const back = bearingDeg(temple, man)
    expect(back).toBeGreaterThan(210)
    expect(back).toBeLessThan(255)
  })

  it('formats distance at rendezvous precision', () => {
    expect(fmtDistance(4)).toBe('4 m')
    expect(fmtDistance(940)).toBe('940 m')
    expect(fmtDistance(2400)).toBe('2.4 km')
    expect(fmtDistance(12_000)).toBe('12 km')
  })

  it('describes fix age the way a person would', () => {
    expect(fmtAge(3000)).toBe('just now')
    expect(fmtAge(40_000)).toBe('40s ago')
    expect(fmtAge(180_000)).toBe('3 min ago')
  })
})
