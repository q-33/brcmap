import { describe, expect, it } from 'vitest'
import type { FireIncident } from './fires'
import { BRC, aqiBand, bearingBetween, byThreat, describeIncident, isFireRelated, kmBetween } from './fires'

const fire = (p: Partial<FireIncident>): FireIncident => ({
  name: 'X', km: 100, bearing: 'N', acres: null, contained: null,
  county: null, state: null, discovered: null, cause: null, ...p,
})

describe('distance and bearing from the city', () => {
  it('measures real incidents at the distance the feeds imply', () => {
    // Stallion and Bug, as returned by NIFC on 2026-08-12
    expect(kmBetween(BRC, { lat: 39.79, lng: -119.72 })).toBeGreaterThan(90)
    expect(kmBetween(BRC, { lat: 39.79, lng: -119.72 })).toBeLessThan(130)
    expect(kmBetween(BRC, BRC)).toBe(0)
  })

  it('points the right way', () => {
    expect(bearingBetween(BRC, { lat: BRC.lat + 1, lng: BRC.lng })).toBe('N')
    expect(bearingBetween(BRC, { lat: BRC.lat - 1, lng: BRC.lng })).toBe('S')
    expect(bearingBetween(BRC, { lat: BRC.lat, lng: BRC.lng + 1 })).toBe('E')
    expect(bearingBetween(BRC, { lat: BRC.lat, lng: BRC.lng - 1 })).toBe('W')
  })
})

describe('aqiBand', () => {
  it('uses the EPA breakpoints', () => {
    expect(aqiBand(50).label).toBe('Good')
    expect(aqiBand(51).label).toBe('Moderate')
    expect(aqiBand(101).label).toBe('Unhealthy for sensitive groups')
    expect(aqiBand(151).label).toBe('Unhealthy')
    expect(aqiBand(201).label).toBe('Very unhealthy')
    expect(aqiBand(301).label).toBe('Hazardous')
  })

  it('says so when there is no reading rather than implying clean air', () => {
    expect(aqiBand(null).label).toBe('Unknown')
    expect(aqiBand(undefined).label).toBe('Unknown')
    expect(aqiBand(Number.NaN).label).toBe('Unknown')
  })
})

describe('byThreat', () => {
  it('puts a live fire above a contained one that happens to be closer', () => {
    // the real case on 2026-08-12: Fred Mt was 100% contained at 126 km, Bug was
    // 57,363 acres and 0% contained at 137 km. Distance alone buries the Bug.
    const fredMt = fire({ name: 'Fred Mt', km: 126.2, acres: 3482, contained: 100 })
    const bug = fire({ name: 'Bug', km: 137.1, acres: 57363, contained: 0 })
    expect([fredMt, bug].sort(byThreat).map(f => f.name)).toEqual(['Bug', 'Fred Mt'])
  })

  it('orders live fires by distance, then by size', () => {
    const near = fire({ name: 'near', km: 50, contained: 0 })
    const far = fire({ name: 'far', km: 200, contained: 0 })
    const tie = fire({ name: 'tie', km: 50.2, contained: 0, acres: 9000 })
    expect([far, near, tie].sort(byThreat).map(f => f.name)).toEqual(['tie', 'near', 'far'])
  })

  it('treats unknown containment as still burning', () => {
    const unknown = fire({ name: 'unknown', km: 150, contained: null })
    const done = fire({ name: 'done', km: 10, contained: 100 })
    expect([done, unknown].sort(byThreat).map(f => f.name)).toEqual(['unknown', 'done'])
  })
})

describe('isFireRelated', () => {
  it('catches the alert types that belong in this section', () => {
    for (const e of ['Red Flag Warning', 'Fire Weather Watch', 'Dense Smoke Advisory', 'Air Quality Alert', 'Evacuation Immediate'])
      expect(isFireRelated(e), e).toBe(true)
  })

  it('leaves ordinary weather to the weather card', () => {
    for (const e of ['Flood Watch', 'High Wind Warning', 'Excessive Heat Warning', null, undefined])
      expect(isFireRelated(e as any), String(e)).toBe(false)
  })
})

describe('describeIncident', () => {
  it('reads like the incident reports it comes from', () => {
    expect(describeIncident(fire({ acres: 57363, contained: 0 }))).toBe('57,363 acres · 0% contained')
  })

  it('omits what the feed has not filled in rather than printing zeroes', () => {
    expect(describeIncident(fire({ acres: null, contained: 40 }))).toBe('40% contained')
    expect(describeIncident(fire({ acres: 12, contained: null }))).toBe('12 acres')
    expect(describeIncident(fire({}))).toBe('')
  })
})
