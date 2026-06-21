import type { FeatureCollection } from 'geojson'
import { CITY_TIME_MAX, CITY_TIME_MIN, MAN, STREET_RADII, addressToLatLng, circleRing, radialPoint, streetName } from './geocode'

// Draw Black Rock City as GeoJSON purely from the parametric geocoder — no map
// tiles required. Matches the official BRC 2026 plan: blue camping band, the
// concentric streets, 15-min radial blocks, cardinal avenues, portals, gate road.

const STREETS = Object.keys(STREET_RADII)
const OUTER = STREETS[STREETS.length - 1]! // Kundalini (K)

const toLngLat = (p: { lat: number, lng: number }): [number, number] => [p.lng, p.lat]

function arcForStreet(street: string, tMin = CITY_TIME_MIN, tMax = CITY_TIME_MAX): [number, number][] {
  const pts: [number, number][] = []
  for (let t = tMin; t <= tMax + 1e-9; t += 0.1) {
    const ll = addressToLatLng({ time: t, street })
    if (ll)
      pts.push([ll.lng, ll.lat])
  }
  return pts
}

function radial(time: number, fromM: number, toM: number): [number, number][] {
  return [radialPoint(time, fromM), radialPoint(time, toM)].map(toLngLat)
}

// Landmarks (real survey coordinates, [lng, lat]).
export const centerCampPoint: [number, number] = [-119.21122602690583, 40.78052685763084]
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
  const features: FeatureCollection['features'] = []
  const push = (kind: string, geometry: any, props: Record<string, any> = {}) =>
    features.push({ type: 'Feature', properties: { kind, ...props }, geometry })

  const espRadius = STREET_RADII.Esplanade!
  const kRadius = STREET_RADII[OUTER]!

  // 1. Blue camping band — placed-camp blocks, Esplanade -> Kundalini, 2:15–9:45.
  const bandTMin = 2.15
  const bandTMax = 9.85
  const bandRing: [number, number][] = [
    ...arcForStreet(OUTER, bandTMin, bandTMax),
    ...arcForStreet('Esplanade', bandTMin, bandTMax).reverse(),
  ]
  bandRing.push(bandRing[0]!)
  push('camping', { type: 'Polygon', coordinates: [bandRing] })

  // 2. Trash fence
  push('fence', { type: 'LineString', coordinates: TRASH_FENCE })

  // 3. Concentric streets + their themed-name labels (upper-left, as on the plan)
  for (const street of STREETS) {
    push('street', { type: 'LineString', coordinates: arcForStreet(street) }, { letter: street, name: streetName(street) })
    const label = addressToLatLng({ time: 9.75, street })
    if (label)
      push('street-label', { type: 'Point', coordinates: [label.lng, label.lat] }, { letter: street, name: streetName(street) })
  }

  // 4. Radial block streets every 15 minutes (Esplanade -> K)
  for (let h = CITY_TIME_MIN; h <= CITY_TIME_MAX + 1e-9; h += 0.25)
    push('radial', { type: 'LineString', coordinates: radial(h, espRadius, kRadius) })

  // 5. Cardinal avenues through the Man + 12:00 promenade to its end circle
  push('avenue', { type: 'LineString', coordinates: radial(9, espRadius, 0).concat(radial(3, 0, espRadius)) }) // 9↔3 through center
  push('avenue', { type: 'LineString', coordinates: radial(12, 0, 900) }) // 12:00 promenade up
  push('avenue', { type: 'LineString', coordinates: circleRing(radialPoint(12, 900), 45) }) // 12:00 end circle
  push('avenue', { type: 'LineString', coordinates: circleRing(MAN, 42) }) // the Man's circle

  // 6. 6:00 gate road — from the Man out through Center Camp to the gate
  push('gate-road', { type: 'LineString', coordinates: radial(6, 0, 2350) })

  // 7. Portals: Center Camp (Rod's Ring Road) + the 3:00/9:00 and 4:30/7:30 plazas
  const portals: { name: string, center: [number, number], radiusM: number }[] = [
    { name: 'Center Camp', center: centerCampPoint, radiusM: 105 },
    { name: '3:00 Plaza', center: toLngLat(radialPoint(3, 1160)), radiusM: 80 },
    { name: '9:00 Plaza', center: toLngLat(radialPoint(9, 1160)), radiusM: 80 },
    { name: '4:30 Plaza', center: toLngLat(radialPoint(4.5, 1486)), radiusM: 78 },
    { name: '7:30 Plaza', center: toLngLat(radialPoint(7.5, 1486)), radiusM: 78 },
  ]
  for (const p of portals) {
    push('portal', { type: 'LineString', coordinates: circleRing({ lat: p.center[1], lng: p.center[0] }, p.radiusM) }, { name: p.name })
    if (p.name !== 'Center Camp')
      push('portal-label', { type: 'Point', coordinates: p.center }, { name: p.name })
  }

  // 8. Walk-in camping (right side): orange boundary arc (just outside K) + labels
  const boundary: [number, number][] = []
  for (let t = 2.0; t <= 5.0 + 1e-9; t += 0.1)
    boundary.push(toLngLat(radialPoint(t, kRadius + 90)))
  push('walkin-boundary', { type: 'LineString', coordinates: boundary })
  for (const t of [2.3, 4.7])
    push('walkin-label', { type: 'Point', coordinates: toLngLat(radialPoint(t, 2050)) }, { name: 'Walk-in Camping' })

  return { type: 'FeatureCollection', features }
}

export const manPoint: [number, number] = [MAN.lng, MAN.lat]
