import { describe, expect, it } from 'vitest'
import { CITY, LOCAL_STATIONS, MAX_STATION_KM, activeStations, isFresh, kmFromCity } from './stations'

describe('local weather stations', () => {
  it('ignores a station before its owner brings it out', () => {
    // Radar's runs 27 Aug – 7 Sep; until then it is sitting at his house
    const before = activeStations(new Date('2026-08-26T12:00:00Z'))
    expect(before.some(s => s.key === 'radar')).toBe(false)
  })

  it('ignores a station after it is packed up', () => {
    expect(activeStations(new Date('2026-09-08T12:00:00Z')).some(s => s.key === 'radar')).toBe(false)
  })

  it('never activates a station with no id yet', () => {
    // stationId 0 is the placeholder for "we have not been given the number"
    const unset = LOCAL_STATIONS.filter(s => s.stationId === 0)
    for (const s of unset)
      expect(activeStations(new Date(`${s.activeFrom}T12:00:00Z`)).some(x => x.key === s.key)).toBe(false)
  })

  it('measures distance from the city', () => {
    expect(kmFromCity(CITY.lat, CITY.lng)).toBeLessThan(0.1)
    // Gerlach, ~30 km south-west, is still "here"
    expect(kmFromCity(40.6544, -119.3562)).toBeLessThan(MAX_STATION_KM)
  })

  it('rejects a station still sitting in Texas', () => {
    // the actual failure this guard exists for: right dates, wrong continent-ish
    const austin = kmFromCity(30.2672, -97.7431)
    expect(austin).toBeGreaterThan(MAX_STATION_KM)
    const dallas = kmFromCity(32.7767, -96.797)
    expect(dallas).toBeGreaterThan(MAX_STATION_KM)
    // and Reno, which is much closer but still not the playa
    expect(kmFromCity(39.5296, -119.8138)).toBeGreaterThan(MAX_STATION_KM)
  })

  it('treats a long silence as not current', () => {
    const now = Date.now()
    expect(isFresh(now - 60_000, now)).toBe(true)
    expect(isFresh(now - 20 * 60_000, now)).toBe(false)
  })
})
