import type { Feature, FeatureCollection } from 'geojson'
import type { BrcAddress } from './geocode'
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

// Center Camp geometry (official 2026): the Café Canopy is 2,999 ft (914 m) from
// the Man on the 6:00 axis. Rod's Ring Road circles it; the ring is sized so its
// inner edge meets the Esplanade (762 m) — that's the portal opening onto the
// open playa. So the plaza spans the Esplanade out to ~C street.
const CANOPY_M = 914
const CENTER_CAMP_R = CANOPY_M - STREET_RADII.Esplanade! // inner edge = Esplanade

// A getter (not a module-load const) so it re-derives after the golden spike is
// calibrated at runtime.
export function getCenterCampPoint(): [number, number] {
  return toLngLat(radialPoint(6, CANOPY_M))
}
// Official 2026 trash-fence pentagon (the 9.23-mile perimeter), stored as
// offsets (Δlng, Δlat) from the golden spike so the fence tracks the city center
// like the streets do. Source: 2026 BRC Measurements (5 surveyed fence points).
const FENCE_OFFSETS: [number, number][] = [
  [-0.029550, -0.003532], // P1
  [-0.013538, 0.020281], // P2
  [0.021201, 0.016048], // P3
  [0.026634, -0.010359], // P4
  [-0.004711, -0.022456], // P5
]
function trashFence(): [number, number][] {
  const ring = FENCE_OFFSETS.map(([dlng, dlat]) => [MAN.lng + dlng, MAN.lat + dlat] as [number, number])
  ring.push(ring[0]!)
  return ring
}

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
  push('fence', { type: 'LineString', coordinates: trashFence() })

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

  // 5. The 6:00 axis: an inner promenade from the Man to Center Camp, then the
  // road resumes OUTSIDE Center Camp and runs out to the gate. The road rings
  // Center Camp via Rod's Ring Road (the portal circle below) — it never cuts
  // straight through the plaza.
  push('avenue', { type: 'LineString', coordinates: radial(6, 0, CANOPY_M - CENTER_CAMP_R) })
  push('gate-road', { type: 'LineString', coordinates: radial(6, CANOPY_M + CENTER_CAMP_R, 2350) })

  // 6. Portals — open plaza circles that mask the blocks underneath.
  //  • Center Camp (Rod's Ring Road) at 6:00, opening onto the Esplanade.
  //  • Inner ring on Bradbury (B): 3:00, 4:30, 7:30, 9:00 (3:00 & 9:00 are the
  //    big "keyhole" plazas).
  //  • Mid-city ring on Gibson (G): 3:00, 4:30, 6:00, 7:30, 9:00.
  // Per the official 2026 measurements (plazas centred at 3,215 ft / 4,825 ft).
  const bRing = STREET_RADII.B!
  const gRing = STREET_RADII.G!
  const plazas: { time: number, ringM: number, radiusM: number, label?: string }[] = [
    // Bradbury (B) ring — labelled
    { time: 3, ringM: bRing, radiusM: 92, label: '3:00 Plaza' },
    { time: 9, ringM: bRing, radiusM: 92, label: '9:00 Plaza' },
    { time: 4.5, ringM: bRing, radiusM: 66, label: '4:30 Plaza' },
    { time: 7.5, ringM: bRing, radiusM: 66, label: '7:30 Plaza' },
    // Gibson (G) mid-city ring — unlabelled to avoid duplicate clock labels
    { time: 3, ringM: gRing, radiusM: 74 },
    { time: 9, ringM: gRing, radiusM: 74 },
    { time: 4.5, ringM: gRing, radiusM: 70 },
    { time: 6, ringM: gRing, radiusM: 70 },
    { time: 7.5, ringM: gRing, radiusM: 70 },
  ]

  // Center Camp first (its own radius/centre).
  const cc = getCenterCampPoint()
  const ccRing = circleRing({ lat: cc[1], lng: cc[0] }, CENTER_CAMP_R)
  push('portal-fill', { type: 'Polygon', coordinates: [ccRing] }, { name: 'Center Camp' })
  push('portal', { type: 'LineString', coordinates: ccRing }, { name: 'Center Camp' })

  for (const p of plazas) {
    const c = radialPoint(p.time, p.ringM)
    const ring = circleRing(c, p.radiusM)
    push('portal-fill', { type: 'Polygon', coordinates: [ring] }, { name: p.label ?? '' })
    push('portal', { type: 'LineString', coordinates: ring }, { name: p.label ?? '' })
    if (p.label)
      push('portal-label', { type: 'Point', coordinates: [c.lng, c.lat] }, { name: p.label })
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

// --- Civic landmarks ---------------------------------------------------------
// Official infrastructure shown on the map. Each is located by a BRC address
// (clock + street, geocoded), a clock + distance from the Man (off-grid items
// like the airport/temple), or a fixed lat/lng. Category drives the marker
// colour + legend grouping. Placements move slightly year to year — sourced
// from the official BRC Map & Guide / city plan.
export type CivicCategory = 'medical' | 'safety' | 'transport' | 'services' | 'sacred'

type CivicAt = BrcAddress | { time: number, radiusM: number } | { lng: number, lat: number }
export interface CivicLandmark { name: string, category: CivicCategory, at: CivicAt, note?: string }

function civicCoord(at: CivicAt): [number, number] | null {
  if ('street' in at) {
    const p = addressToLatLng(at)
    return p ? [p.lng, p.lat] : null
  }
  if ('radiusM' in at)
    return toLngLat(radialPoint(at.time, at.radiusM))
  return [at.lng, at.lat]
}

// Sourced from the official 2026 Survival Guide → On-Playa Resources and the BRC
// city plan. On-grid items use their clock+street address (stable year to year);
// off-grid items (airport, DPW, Greeters, fuel) use a clock bearing + approximate
// distance from the Man. The outer street K sits ~1779 m out, for reference.
const K_M = STREET_RADII[OUTER]!
export const CIVIC_LANDMARKS: CivicLandmark[] = [
  // Medical (red)
  { name: 'Rampart Hospital', category: 'medical', at: { time: 5.25, street: 'Esplanade' }, note: 'Main field hospital · ESD station' },
  { name: 'First Aid · 3:00', category: 'medical', at: { time: 3, street: 'C' }, note: 'Medical + Ranger Outpost (Berlin)' },
  { name: 'First Aid · 9:00', category: 'medical', at: { time: 9, street: 'C' }, note: 'Medical + Ranger Outpost (Tokyo)' },
  // Safety (blue)
  { name: 'Ranger HQ', category: 'safety', at: { time: 6.5, street: 'Esplanade' }, note: 'Black Rock Rangers headquarters' },
  // Services (teal)
  { name: 'Center Camp', category: 'services', at: { time: 6.25, street: 'B' }, note: 'Center Camp Plaza · Arctica ice (main)' },
  { name: 'Playa Info', category: 'services', at: { time: 5.75, street: 'Esplanade' }, note: 'Info + Lost & Found' },
  { name: 'Ice · 3:00', category: 'services', at: { time: 3, street: 'G' }, note: 'Arctica ice sales' },
  { name: 'Ice · 9:00', category: 'services', at: { time: 9, street: 'G' }, note: 'Arctica ice sales' },
  { name: 'DPW Depot', category: 'services', at: { time: 5.5, radiusM: K_M + 205 }, note: 'Dept. of Public Works · just past Kilgore (K)' },
  // Transport / entry (amber)
  { name: 'Airport (88NV)', category: 'transport', at: { lng: -119.2107394, lat: 40.7618388 }, note: 'BRC Municipal Airport · off 5:00, outside the fence' },
  { name: 'Greeters', category: 'transport', at: { time: 6, radiusM: 2044 }, note: 'Welcome station + printed city map · 6,705 ft out on 6:00' },
  { name: 'Fuel · Hell Station', category: 'transport', at: { time: 9.5, radiusM: K_M + 110 }, note: 'Participant vehicle fueling · past the outer street' },
  // Sacred (purple). 2026 Temple geometry publishes early July; this is the
  // 12:00 deep-playa axis at an approximate distance until then.
  { name: 'Temple (approx.)', category: 'sacred', at: { time: 12, radiusM: 920 }, note: 'Deep playa, 12:00 axis · exact 2026 location pending official GIS' },
]

export function civicLandmarksGeoJson(): FeatureCollection {
  const features: Feature[] = []
  for (const l of CIVIC_LANDMARKS) {
    const coord = civicCoord(l.at)
    if (coord)
      features.push({ type: 'Feature', properties: { kind: 'civic', name: l.name, category: l.category, note: l.note ?? '' }, geometry: { type: 'Point', coordinates: coord } })
  }
  return { type: 'FeatureCollection', features }
}
