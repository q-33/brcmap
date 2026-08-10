import { describe, expect, it } from 'vitest'
import { dustRisk, tempBoth, toCelsius, toKmh, windBoth } from './weather'

// The weather API asks Open-Meteo for Fahrenheit and mph, so everything metric
// on the Live page is converted here. Worth pinning: a wrong factor would read
// as plausible weather rather than as an obvious bug.
describe('unit conversion', () => {
  it('converts temperature at the fixed points', () => {
    expect(toCelsius(32)).toBeCloseTo(0, 10)
    expect(toCelsius(212)).toBeCloseTo(100, 10)
    expect(toCelsius(-40)).toBeCloseTo(-40, 10)
    expect(toCelsius(98.6)).toBeCloseTo(37, 6)
  })

  it('converts wind speed', () => {
    expect(toKmh(0)).toBe(0)
    expect(toKmh(1)).toBeCloseTo(1.609344, 10)
    expect(toKmh(60)).toBeCloseTo(96.56, 2)
  })

  it('formats both units for display', () => {
    expect(tempBoth(95)).toBe('95°F / 35°C')
    expect(tempBoth(72)).toBe('72°F / 22°C')
    expect(windBoth(28)).toBe('28 mph / 45 km/h')
    expect(windBoth(0)).toBe('0 mph / 0 km/h')
  })

  it('leaves the dust heuristic on mph, the unit its thresholds were set in', () => {
    // 35 mph is the high-dust line; 56 km/h is the same wind, not a new one
    expect(dustRisk(35).label).toBe('High dust risk')
    expect(dustRisk(34).label).toBe('Dusty — goggles up')
    expect(Math.round(toKmh(35))).toBe(56)
  })
})
