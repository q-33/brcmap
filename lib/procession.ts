// The exodus procession: taillights crawling out Gate Road on the homepage.
//
// Not decoration — a reading. Each light is one OPEN post on the rideshare
// board (someone thumbing, or someone with seats), and the crawl speed is the
// crowd-reported Gate Road time: a 6-hour line barely creeps, a moving line
// flows. The map answers "how bad is it out there?" at a glance, the same way
// the dust answers the wind.
//
// Pure path math here so it can be tested; the drawing lives in PlayaMap.

export type LngLat = [number, number]

export interface RoadPath {
  pts: LngLat[]
  /** cumulative normalised arc length, cum[0]=0 … cum[n-1]=1 */
  cum: number[]
}

/** Planar-enough distance for a 6 km road: metres via equirectangular. */
function segMeters(a: LngLat, b: LngLat): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180)
  const ky = 110_540
  const dx = (b[0] - a[0]) * kx
  const dy = (b[1] - a[1]) * ky
  return Math.hypot(dx, dy)
}

/**
 * Prepare a polyline for constant-speed travel. `startNear` picks which end is
 * t=0 — the procession must leave FROM the city, and the surveyed line's
 * point order is an accident of the GIS export, not a promise.
 */
export function buildRoadPath(points: LngLat[], startNear: LngLat): RoadPath | null {
  if (points.length < 2)
    return null
  const pts = [...points]
  const d0 = segMeters(pts[0]!, startNear)
  const dN = segMeters(pts[pts.length - 1]!, startNear)
  if (dN < d0)
    pts.reverse()
  const lens: number[] = [0]
  for (let i = 1; i < pts.length; i++)
    lens.push(lens[i - 1]! + segMeters(pts[i - 1]!, pts[i]!))
  const total = lens[lens.length - 1]!
  if (total <= 0)
    return null
  return { pts, cum: lens.map(l => l / total) }
}

/** Position at t∈[0,1] along the path, constant speed by arc length. */
export function pointAt(path: RoadPath, t: number): LngLat {
  const x = Math.min(1, Math.max(0, t))
  const { pts, cum } = path
  let i = 1
  while (i < cum.length - 1 && cum[i]! < x) i++
  const t0 = cum[i - 1]!
  const t1 = cum[i]!
  const f = t1 > t0 ? (x - t0) / (t1 - t0) : 0
  const a = pts[i - 1]!
  const b = pts[i]!
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

/**
 * How long one light takes to travel the whole road, from the crowd-reported
 * Gate Road minutes. Not real time — 6 real hours as 6 animated minutes would
 * look frozen — but ORDER-PRESERVING: twice the wait is twice the crawl.
 * Clamped so an empty meter still drifts and a 12-hour doomsday still moves.
 */
export function lapSeconds(waitMinutes: number | null): number {
  if (waitMinutes == null)
    return 90 // no reports: a calm default drift
  return Math.min(600, Math.max(45, waitMinutes * 1.25))
}

/** How many lights: one per open ride post, kept legible. */
export function lightCount(openRides: number): number {
  return Math.min(18, Math.max(0, openRides))
}
