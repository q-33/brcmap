import type { Feature, FeatureCollection } from 'geojson'
import { CITY_TIME_MAX, CITY_TIME_MIN, MAN, STREET_RADII, addressToLatLng, circleRing, radialPoint, streetName } from './geocode'

// Render Black Rock City to match the official BRC 2026 plan: individual blue
// camp blocks separated by white street channels, on a near-white ground.
// Everything is generated from the parametric geocoder (real metres / coords).

const STREETS = Object.keys(STREET_RADII)
const OUTER = STREETS[STREETS.length - 1]! // Kundalini (K)

const toLngLat = (p: { lat: number, lng: number }): [number, number] => [p.lng, p.lat]
const HALF_STREET_M = 6 // half the street width → the gap between blocks

function arcAt(radiusM: number, tMin: number, tMax: number): [number, number][] {
  const pts: [number, number][] = []
  for (let t = tMin; t <= tMax + 1e-9; t += 0.1)
    pts.push(toLngLat(radialPoint(t, radiusM)))
  return pts
}

// One city block: an annular-sector cell between two streets and two radials,
// inset by half a street width on each side to leave the white street channels.
function block(rIn: number, rOut: number, t0: number, t1: number): Feature {
  const ring: [number, number][] = []
  const steps = 4
  for (let s = 0; s <= steps; s++)
    ring.push(toLngLat(radialPoint(t0 + ((t1 - t0) * s) / steps, rIn)))
  for (let s = 0; s <= steps; s++)
    ring.push(toLngLat(radialPoint(t1 - ((t1 - t0) * s) / steps, rOut)))
  ring.push(ring[0]!)
  return { type: 'Feature', properties: { kind: 'block' }, geometry: { type: 'Polygon', coordinates: [ring] } }
}

// Center Camp sits on the 6:00 axis (the gate road), centred between A and B.
// A getter (not a module-load const) so it re-derives after the golden spike is
// calibrated at runtime.
export function getCenterCampPoint(): [number, number] {
  return toLngLat(radialPoint(6, (STREET_RADII.A! + STREET_RADII.B!) / 2))
}
export const greetersPoint: [number, number] = [-119.220953, 40.773203]
const TRASH_FENCE: [number, number][] = [
  [-119.233566, 40.782814],
  [-119.217274, 40.807028],
  [-119.181931, 40.802722],
  [-119.176407, 40.775857],
  [-119.208301, 40.763558],
  [-119.233566, 40.782814],
]

export function cityGridGeoJson(): FeatureCollection {
  const features: Feature[] = []
  const push = (kind: string, geometry: any, props: Record<string, any> = {}) =>
    features.push({ type: 'Feature', properties: { kind, ...props }, geometry })

  const espRadius = STREET_RADII.Esplanade!
  const kRadius = STREET_RADII[OUTER]!

  // 1. City BLOCKS — blue cells, Esplanade→K, 2:00–10:00, 15-min columns.
  const colMin = 2.0
  const colMax = 9.75
  for (let i = 0; i < STREETS.length - 1; i++) {
    const rIn = STREET_RADII[STREETS[i]!]! + HALF_STREET_M
    const rOut = STREET_RADII[STREETS[i + 1]!]! - HALF_STREET_M
    if (rOut <= rIn)
      continue
    const rMid = (rIn + rOut) / 2
    const tGap = (HALF_STREET_M / rMid) * (6 / Math.PI) // metres → clock-hours at rMid
    for (let j = colMin; j < colMax - 1e-9; j += 0.25) {
      const t0 = j + tGap
      const t1 = j + 0.25 - tGap
      if (t1 > t0)
        features.push(block(rIn, rOut, t0, t1))
    }
  }

  // 1b. Light-blue promenade wedges along the major avenues (decorative, as on plan)
  for (const t of [3, 4.5, 6, 7.5, 9]) {
    const ring: [number, number][] = []
    ring.push(toLngLat(radialPoint(t - 0.08, espRadius)))
    for (let s = 0; s <= 6; s++)
      ring.push(toLngLat(radialPoint(t - 0.55 + (1.1 * s) / 6, kRadius)))
    ring.push(toLngLat(radialPoint(t + 0.08, espRadius)))
    ring.push(ring[0]!)
    push('wedge', { type: 'Polygon', coordinates: [ring] })
  }

  // 2. Trash fence (red dashed pentagon)
  push('fence', { type: 'LineString', coordinates: TRASH_FENCE })

  // 3. Named-street labels (upper-left, as on the plan)
  for (const street of STREETS) {
    const label = addressToLatLng({ time: 9.78, street })
    if (label)
      push('street-label', { type: 'Point', coordinates: [label.lng, label.lat] }, { name: streetName(street) })
  }

  // 4. Cardinal avenues through the Man, the 12:00 promenade + end circle, Man circle
  const radial = (t: number, a: number, b: number) => [radialPoint(t, a), radialPoint(t, b)].map(toLngLat)
  push('avenue', { type: 'LineString', coordinates: radial(9, espRadius, 0).concat(radial(3, 0, espRadius)) })
  push('avenue', { type: 'LineString', coordinates: radial(12, 0, 900) })
  push('avenue', { type: 'LineString', coordinates: circleRing(radialPoint(12, 900), 45) })
  push('avenue', { type: 'LineString', coordinates: circleRing(MAN, 42) })

  // 5. 6:00 gate road — from the Man out through Center Camp to the gate
  push('gate-road', { type: 'LineString', coordinates: radial(6, 0, 2350) })

  // 6. Portals: Center Camp (Rod's Ring Road) + the 3:00/9:00 and 4:30/7:30 plazas
  const portals: { name: string, center: [number, number], radiusM: number }[] = [
    { name: 'Center Camp', center: getCenterCampPoint(), radiusM: 100 },
    { name: '3:00 Plaza', center: toLngLat(radialPoint(3, STREET_RADII.D!)), radiusM: 78 },
    { name: '9:00 Plaza', center: toLngLat(radialPoint(9, STREET_RADII.D!)), radiusM: 78 },
    { name: '4:30 Plaza', center: toLngLat(radialPoint(4.5, STREET_RADII.G!)), radiusM: 76 },
    { name: '7:30 Plaza', center: toLngLat(radialPoint(7.5, STREET_RADII.G!)), radiusM: 76 },
  ]
  for (const p of portals) {
    const ring = circleRing({ lat: p.center[1], lng: p.center[0] }, p.radiusM)
    // a filled circle that masks the blocks/grid underneath → an open plaza
    push('portal-fill', { type: 'Polygon', coordinates: [ring] }, { name: p.name })
    push('portal', { type: 'LineString', coordinates: ring }, { name: p.name })
    if (p.name !== 'Center Camp')
      push('portal-label', { type: 'Point', coordinates: p.center }, { name: p.name })
  }

  // 7. Walk-in camping (right side): orange boundary arc + two labels
  push('walkin-boundary', { type: 'LineString', coordinates: arcAt(kRadius + 90, 2.0, 5.0) })
  for (const t of [2.3, 4.7])
    push('walkin-label', { type: 'Point', coordinates: toLngLat(radialPoint(t, 2050)) }, { name: 'Walk-in Camping' })

  return { type: 'FeatureCollection', features }
}

export function getManPoint(): [number, number] {
  return [MAN.lng, MAN.lat]
}
