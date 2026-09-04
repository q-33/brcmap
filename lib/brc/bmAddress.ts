// Turn a Burning Man API camp location into something we can put on the map.
//
// Their camps carry NO coordinates. A placement is three strings:
//
//   { frontage: "7:30", intersection: "E", intersection_type: "&" }
//
// so the only way onto the map is through our own geocoder. Either side may
// hold the clock or the street, and the vocabulary is wider than ours: L street,
// plazas, portals, Rte 66, Airport Road. Anything we cannot place honestly comes
// back as `unplaceable` with a reason rather than a guessed pin, because a camp
// dropped in the wrong block is worse than a camp with no pin.

import type { BrcAddress, LatLng } from './geocode'
import { planToLngLat } from './cityGeoJson'
import { STREET_RADII, addressToLatLng, formatAddress } from './geocode'
import { GIS_PLAZAS } from './planCity'

export interface BmLocationInput {
  frontage?: string | null
  intersection?: string | null
  intersection_type?: string | null
}

export type BmPlacement =
  /** A normal street corner we can geocode, e.g. "7:30 & E". */
  | { kind: 'street', address: BrcAddress, label: string }
  /** A named plaza we draw from the surveyed GIS. */
  | { kind: 'plaza', plaza: string, label: string }
  /** Known address, but outside what we can place. */
  | { kind: 'unplaceable', reason: string, label: string }

const CLOCK = /^(\d{1,2}):(\d{2})$/
const LETTER = /^[A-L]$/i

const isClock = (s: string) => CLOCK.test(s)
const isStreet = (s: string) => /^esplanade$/i.test(s) || LETTER.test(s)

function clockToHours(s: string): number | null {
  const m = s.match(CLOCK)
  if (!m)
    return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59)
    return null
  return h + min / 60
}

function normalizeStreet(s: string): string {
  return /^esplanade$/i.test(s) ? 'Esplanade' : s.toUpperCase()
}

/**
 * Burning Man writes plazas as "9:00 B Plaza"; our surveyed GIS names them
 * "9:00 & B Plaza". Center Camp Plaza matches on both sides as-is.
 */
function matchPlaza(s: string): string | null {
  const want = s.trim().toLowerCase()
  const withAmp = want.replace(/^(\d{1,2}:\d{2})\s+([a-l])\s+plaza$/i, '$1 & $2 plaza')
  for (const p of GIS_PLAZAS) {
    const name = p.n.toLowerCase()
    if (name === want || name === withAmp)
      return p.n
  }
  return null
}

/** Human-readable form of whatever they sent, for logging and admin review. */
export function bmLocationLabel(loc: BmLocationInput): string {
  const a = (loc.frontage ?? '').trim()
  const b = (loc.intersection ?? '').trim()
  const join = (loc.intersection_type ?? '&').trim() || '&'
  if (a && b)
    return `${a} ${join} ${b}`
  return a || b || '(no location)'
}

/** Map a Burning Man camp location onto our address model. */
export function bmPlacement(loc: BmLocationInput | null | undefined): BmPlacement {
  const label = bmLocationLabel(loc ?? {})
  if (!loc)
    return { kind: 'unplaceable', reason: 'no location given', label }

  const a = (loc.frontage ?? '').trim()
  const b = (loc.intersection ?? '').trim()

  // Plazas and portals come through on either side, usually with "@".
  for (const side of [a, b]) {
    if (!side)
      continue
    if (/plaza/i.test(side)) {
      const plaza = matchPlaza(side)
      return plaza
        ? { kind: 'plaza', plaza, label }
        : { kind: 'unplaceable', reason: `unknown plaza "${side}"`, label }
    }
    if (/portal/i.test(side))
      return { kind: 'unplaceable', reason: `portal addresses are not placed yet ("${side}")`, label }
    if (/rte\s*66|airport/i.test(side))
      return { kind: 'unplaceable', reason: `outside the street grid ("${side}")`, label }
  }

  if (!a || !b)
    return { kind: 'unplaceable', reason: 'needs both a frontage and an intersection', label }

  // Either side may hold the clock; the other must be the lettered street.
  let clockPart: string | null = null
  let streetPart: string | null = null
  if (isClock(a) && isStreet(b)) {
    clockPart = a
    streetPart = b
  }
  else if (isStreet(a) && isClock(b)) {
    clockPart = b
    streetPart = a
  }
  if (!clockPart || !streetPart)
    return { kind: 'unplaceable', reason: `cannot read "${label}" as clock + street`, label }

  const time = clockToHours(clockPart)
  if (time == null)
    return { kind: 'unplaceable', reason: `bad clock time "${clockPart}"`, label }

  const street = normalizeStreet(streetPart)
  // They list L; the 2026 city stops at K. Placing an L camp would put it in
  // open playa, so say so instead.
  if (!(street in STREET_RADII))
    return { kind: 'unplaceable', reason: `${street} street is not in the drawn city`, label }

  return { kind: 'street', address: { time, street }, label }
}

/** Resolve a placement to coordinates, or null when we cannot place it. */
export function bmPlacementToLatLng(p: BmPlacement): LatLng | null {
  if (p.kind === 'street')
    return addressToLatLng(p.address)
  if (p.kind === 'plaza') {
    const plaza = GIS_PLAZAS.find(x => x.n === p.plaza)
    if (!plaza)
      return null
    // Plaza centres are plan-oriented metre offsets from the Man; planToLngLat
    // applies the city's 45° bearing and reads MAN live, so a golden-spike
    // recalibration moves these with everything else.
    const [lng, lat] = planToLngLat(plaza.c[0]!, plaza.c[1]!)
    return { lat, lng }
  }
  return null
}

/** "7:30 & E" for a placed camp, else null. */
export function bmAddressString(p: BmPlacement): string | null {
  return p.kind === 'street' ? formatAddress(p.address) : null
}
