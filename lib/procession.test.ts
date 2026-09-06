import { describe, expect, it } from 'vitest'
import { buildRoadPath, lapSeconds, lightCount, pointAt } from './procession'
import type { LngLat } from './procession'

// The procession claims to show which way the exodus flows and how fast.
// Backwards lights or speed inversions would be a small lie on the homepage.
describe('exodus procession path', () => {
  // a simple L: 1 km east then 1 km north, in degree-ish terms at BRC latitude
  const east: LngLat = [-119.20, 40.78]
  const corner: LngLat = [-119.188, 40.78]
  const north: LngLat = [-119.188, 40.789]
  const line: LngLat[] = [east, corner, north]

  it('starts the path at the end nearest the city, whatever the point order', () => {
    const a = buildRoadPath(line, east)!
    expect(a.pts[0]).toEqual(east)
    const b = buildRoadPath([...line].reverse(), east)!
    expect(b.pts[0]).toEqual(east) // reversed input, same origin
  })

  it('travels at constant ground speed, not constant point index', () => {
    const p = buildRoadPath(line, east)!
    // halfway by arc length should sit near the corner (legs are ~equal)
    const mid = pointAt(p, 0.5)
    expect(Math.abs(mid[0] - corner[0])).toBeLessThan(0.004)
  })

  it('clamps t to the road — no lights in the desert past the pavement', () => {
    const p = buildRoadPath(line, east)!
    expect(pointAt(p, -0.5)).toEqual(east)
    expect(pointAt(p, 1.5)).toEqual(north)
  })

  it('crawls slower the worse the crowd says the line is', () => {
    expect(lapSeconds(60)).toBeLessThan(lapSeconds(240))
    expect(lapSeconds(240)).toBeLessThan(lapSeconds(480))
  })

  it('still moves at both extremes', () => {
    expect(lapSeconds(null)).toBeGreaterThan(0)
    expect(lapSeconds(720)).toBeLessThanOrEqual(600) // doomsday is slow, not frozen
    expect(lapSeconds(0)).toBeGreaterThanOrEqual(45) // and joy is fast, not teleporting
  })

  it('one light per open ride post, capped for legibility', () => {
    expect(lightCount(0)).toBe(0) // empty board: no procession, honestly
    expect(lightCount(5)).toBe(5)
    expect(lightCount(400)).toBe(18)
  })

  it('refuses degenerate roads', () => {
    expect(buildRoadPath([east], east)).toBeNull()
    expect(buildRoadPath([east, east], east)).toBeNull()
  })
})
