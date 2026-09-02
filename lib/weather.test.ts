import { describe, expect, it } from 'vitest'
import { dustRisk, rainIntensity, tempBoth, toCelsius, toKmh, windBoth } from './weather'

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

// The map's rain animation is driven entirely by this, so a code landing in the
// wrong bucket is a wrong sky over the city.
describe('rain intensity from WMO codes', () => {
  it('reads a dry sky as no rain', () => {
    for (const code of [0, 1, 2, 3, 45, 48])
      expect(rainIntensity(code)).toBe(0)
  })

  it('grades rain by how hard it is falling', () => {
    expect(rainIntensity(51)).toBe(1) // light drizzle
    expect(rainIntensity(61)).toBe(1) // light rain
    expect(rainIntensity(63)).toBe(2) // moderate rain
    expect(rainIntensity(65)).toBe(3) // heavy rain
  })

  it('treats showers on the same scale as steady rain', () => {
    expect(rainIntensity(80)).toBe(1)
    expect(rainIntensity(81)).toBe(2)
    expect(rainIntensity(82)).toBe(3)
  })

  it('puts every thunderstorm at the top of the scale', () => {
    for (const code of [95, 96, 99])
      expect(rainIntensity(code)).toBe(3)
  })

  // Snow is not rain. Animating it as rain would misreport the weather, and on
  // this playa the difference decides whether you can drive out.
  it('does not animate snow as rain', () => {
    for (const code of [71, 73, 75, 77, 85, 86])
      expect(rainIntensity(code)).toBe(0)
  })

  it('treats an unknown code as dry rather than guessing', () => {
    expect(rainIntensity(-1)).toBe(0)
    expect(rainIntensity(999)).toBe(0)
  })

  // Every wet code the app can label must also animate, or the pill says rain
  // while the map shows a clear sky.
  it('animates every rain-ish code the WMO table labels', () => {
    for (const code of [51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])
      expect(rainIntensity(code)).toBeGreaterThan(0)
  })
})
