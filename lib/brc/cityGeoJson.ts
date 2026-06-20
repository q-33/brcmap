import type { FeatureCollection } from 'geojson'
import { CITY_TIME_MAX, CITY_TIME_MIN, MAN, STREET_RADII, addressToLatLng, streetName } from './geocode'

// Draw Black Rock City as GeoJSON purely from the parametric geocoder — no map
// tiles required. Lettered streets become arcs; clock hours become radial spokes.

const STREETS = Object.keys(STREET_RADII)

function arcForStreet(street: string): [number, number][] {
  const pts: [number, number][] = []
  // sample every ~6 minutes of clock across the populated arc
  for (let t = CITY_TIME_MIN; t <= CITY_TIME_MAX + 1e-9; t += 0.1) {
    const ll = addressToLatLng({ time: t, street })
    if (ll)
      pts.push([ll.lng, ll.lat])
  }
  return pts
}

function spokeForHour(time: number): [number, number][] {
  const inner = addressToLatLng({ time, street: STREETS[0]! })
  const outer = addressToLatLng({ time, street: STREETS[STREETS.length - 1]! })
  if (!inner || !outer)
    return []
  return [[inner.lng, inner.lat], [outer.lng, outer.lat]]
}

// Landmarks (real survey coordinates, [lng, lat]).
export const centerCampPoint: [number, number] = [-119.21122602690583, 40.78052685763084]
export const greetersPoint: [number, number] = [-119.220953, 40.773203]
// Trash-fence pentagon (the city boundary).
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

  // trash fence (city boundary)
  features.push({
    type: 'Feature',
    properties: { kind: 'fence' },
    geometry: { type: 'LineString', coordinates: TRASH_FENCE },
  })

  for (const street of STREETS) {
    features.push({
      type: 'Feature',
      properties: { kind: 'street', letter: street, name: streetName(street) },
      geometry: { type: 'LineString', coordinates: arcForStreet(street) },
    })
    // a label anchored near the 9:45 end of the arc (as on the official plan)
    const label = addressToLatLng({ time: 9.75, street })
    if (label) {
      features.push({
        type: 'Feature',
        properties: { kind: 'street-label', letter: street, name: streetName(street) },
        geometry: { type: 'Point', coordinates: [label.lng, label.lat] },
      })
    }
  }

  for (let h = CITY_TIME_MIN; h <= CITY_TIME_MAX; h += 0.5) {
    features.push({
      type: 'Feature',
      properties: { kind: 'spoke', time: h },
      geometry: { type: 'LineString', coordinates: spokeForHour(h) },
    })
  }

  return { type: 'FeatureCollection', features }
}

export const manPoint: [number, number] = [MAN.lng, MAN.lat]
