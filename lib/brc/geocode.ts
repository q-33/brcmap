// Parametric Black Rock City geocoder — address <-> lat/lng as pure math, no
// shipped per-year GeoJSON, works fully offline. Constants come from Burning
// Man's OFFICIAL 2026 city data (golden spike, "4:30 axis = true N/S", and the
// published street radii) and can be swapped per year as the survey updates.
//
// BRC is a polar city: the Man at the center, concentric lettered streets at
// increasing radii, and a clock bearing (1 hour = 30 deg) for the angle.

export interface LatLng {
  lat: number
  lng: number
}

export interface BrcAddress {
  /** clock time in decimal hours, e.g. 7.5 === "7:30" */
  time: number
  /** street name: "Esplanade" or "A".."K" */
  street: string
}

// --- The Golden Spike: the city's calibration point --------------------------
// Each year the DPW survey crew drives a "golden spike" into the playa at the
// exact center of Black Rock City — the base of the Man. Every address here is
// computed relative to it, so this ONE coordinate re-snaps the entire city
// (geocoding AND the drawn map).
//
// Set to the OFFICIAL 2026 golden spike from Burning Man's published city data
// (innovate.burningman.org / 2026 BRC Measurements, 2.25.2026). A runtime env
// override (NUXT_PUBLIC_GOLDEN_SPIKE) still takes precedence if set.
export const GOLDEN_SPIKE_2026: LatLng | null = { lat: 40.783242, lng: -119.207871 }
const FALLBACK_CENTER: LatLng = { lat: 40.786394, lng: -119.203492 }

// The active city center (the golden spike). Exported as a `let` so a runtime
// calibration via calibrateCityCenter() propagates to every importer through ES
// module live bindings — all geocoding and the drawn city read it at call time.
// `MAN` is the name used throughout the codebase.
export let MAN: LatLng = GOLDEN_SPIKE_2026 ?? FALLBACK_CENTER

// True once anchored to a real surveyed spike (compile-time const or runtime
// override) rather than the fallback estimate.
let _spikeKnown = GOLDEN_SPIKE_2026 != null

/** Whether the city is anchored to a real surveyed golden spike. */
export function goldenSpikeKnown(): boolean {
  return _spikeKnown
}

/** The active city center / golden spike. */
export function getCityCenter(): LatLng {
  return MAN
}

/**
 * Re-anchor the entire city (geocoding + the drawn map) to a surveyed golden
 * spike. Call once at startup; everything downstream reads MAN live.
 */
export function calibrateCityCenter(center: LatLng, known = true): void {
  MAN = center
  _spikeKnown = known
}

/** Parse a "lat,lng" string (e.g. NUXT_PUBLIC_GOLDEN_SPIKE) to a LatLng, or null. */
export function parseLatLng(s: string | null | undefined): LatLng | null {
  if (!s)
    return null
  const parts = s.split(',').map(p => Number(p.trim()))
  if (parts.length !== 2)
    return null
  const [lat, lng] = parts as [number, number]
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return null
  return { lat, lng }
}

// bearing(deg, clockwise from north) = BEARING_INTERCEPT + BEARING_PER_HOUR * time
// From the official 2026 measurements: "True North/South follows the 4:30 axis",
// i.e. 4:30 points due south (180°) → intercept = 180 - 30*4.5 = 45. Verified:
// this puts Greeters (6:00) at bearing 225° and 6,705 ft from the Man, both
// matching the published 2026 Greeters coordinate exactly.
const BEARING_INTERCEPT = 45.0
const BEARING_PER_HOUR = 30.0

// Official 2026 street-center radii (metres) from the Man, innermost -> outermost,
// derived from the 2026 BRC Measurements (Esplanade 2,500 ft; K 11,510 ft dia.;
// stated block depths). Reproduces the doc's own checkpoints (Bradbury/B at
// 3,215 ft, Gibson/G at 4,825 ft). Single source of truth for geocoding AND the
// drawn city — never stylise/compress these.
export const STREET_RADII: Record<string, number> = {
  Esplanade: 762.0, // 2,500 ft
  A: 894.6, // 2,935 ft
  B: 979.9, // 3,215 ft (Bradbury plaza ring — matches doc)
  C: 1065.3, // 3,495 ft
  D: 1150.6, // 3,775 ft
  E: 1237.5, // 4,060 ft
  F: 1385.3, // 4,545 ft
  G: 1470.7, // 4,825 ft (Gibson plaza ring — matches doc)
  H: 1556.0, // 5,105 ft
  I: 1641.4, // 5,385 ft
  J: 1696.2, // 5,565 ft
  K: 1754.1, // 5,755 ft (11,510 ft diameter)
}

// city occupies roughly the 2:00–10:00 arc
export const CITY_TIME_MIN = 2
export const CITY_TIME_MAX = 10

// Current Black Rock City year + themed street names. The 2026 theme is
// "Axis Mundi" — lettered streets are named after notional centers of the world.
// Letters stay the canonical key (stored/queried); names are for display.
export const CITY_YEAR = 2026
export const STREET_NAMES: Record<string, string> = {
  Esplanade: 'Esplanade',
  A: 'Ararat',
  B: 'Bodhi',
  C: 'Chomolungma',
  D: 'Delphi',
  E: 'Eternal',
  F: 'Fulcrum',
  G: 'Great Oak',
  H: 'Heiau',
  I: 'Iroko',
  J: 'Jiba',
  K: 'Kundalini',
}

/** Themed street name for a letter (e.g. "E" -> "Eternal"), falling back to the letter. */
export function streetName(letter: string): string {
  return STREET_NAMES[letter] ?? letter
}

const M_PER_DEG_LAT = 111320
const mPerDegLng = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

// --- Forward: address -> lat/lng --------------------------------------------
export function addressToLatLng({ time, street }: BrcAddress): LatLng | null {
  const radius = STREET_RADII[street]
  if (radius == null)
    return null
  return radialPoint(time, radius)
}

/** A point at a given clock time and radius (metres) from the Man. */
export function radialPoint(time: number, radiusM: number): LatLng {
  const bearing = toRad(BEARING_INTERCEPT + BEARING_PER_HOUR * time)
  const x = radiusM * Math.sin(bearing) // east (m)
  const y = radiusM * Math.cos(bearing) // north (m)
  return {
    lat: MAN.lat + y / M_PER_DEG_LAT,
    lng: MAN.lng + x / mPerDegLng(MAN.lat),
  }
}

/** A geographic circle (closed ring of [lng, lat]) of radius metres around a center. */
export function circleRing(center: LatLng, radiusM: number, steps = 64): [number, number][] {
  const ring: [number, number][] = []
  const mLng = mPerDegLng(center.lat)
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    ring.push([
      center.lng + (radiusM * Math.sin(a)) / mLng,
      center.lat + (radiusM * Math.cos(a)) / M_PER_DEG_LAT,
    ])
  }
  return ring
}

// --- Reverse: lat/lng -> nearest address ------------------------------------
export function latLngToAddress({ lat, lng }: LatLng): BrcAddress & { distanceM: number } {
  const x = (lng - MAN.lng) * mPerDegLng(MAN.lat)
  const y = (lat - MAN.lat) * M_PER_DEG_LAT
  const radius = Math.hypot(x, y)
  let bearing = (toDeg(Math.atan2(x, y)) + 360) % 360

  // keep the bearing on the same branch as the fitted model
  let time = (bearing - BEARING_INTERCEPT) / BEARING_PER_HOUR
  if (time < 0) {
    bearing += 360
    time = (bearing - BEARING_INTERCEPT) / BEARING_PER_HOUR
  }

  // nearest lettered street by radius
  let street = 'Esplanade'
  let best = Number.POSITIVE_INFINITY
  for (const [name, r] of Object.entries(STREET_RADII)) {
    const d = Math.abs(r - radius)
    if (d < best) {
      best = d
      street = name
    }
  }
  return { time, street, distanceM: best }
}

// --- Parse / format "7:30 & E" ----------------------------------------------
export function parseAddress(input: string): BrcAddress | null {
  const parts = input.split('&').map(s => s.trim())
  if (parts.length !== 2)
    return null
  // either order: "7:30 & E" or "E & 7:30"
  const [a, b] = parts
  if (!a || !b)
    return null
  const timeStr = /:/.test(a) ? a : b
  const street = /:/.test(a) ? b : a
  const m = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (!m || !(street in STREET_RADII))
    return null
  const time = Number(m[1]) + Number(m[2]) / 60
  return { time, street }
}

export function formatAddress({ time, street }: BrcAddress, roundToMinutes = 15): string {
  const step = roundToMinutes / 60
  const t = Math.round(time / step) * step
  const h = Math.floor(t)
  const min = Math.round((t - h) * 60)
  return `${h}:${String(min).padStart(2, '0')} & ${street}`
}

/** Same as formatAddress but with the themed street name, e.g. "7:30 & Eternal". */
export function formatAddressNamed(addr: BrcAddress, roundToMinutes = 15): string {
  return formatAddress({ ...addr, street: streetName(addr.street) }, roundToMinutes)
}

// --- GPS readout -------------------------------------------------------------
// Display text only. None of this feeds addressToLatLng/formatAddress, so a
// camp's stored address is untouched by anything below — these functions exist
// purely to say something more useful than "near 7:30 & Eternal" when the fix
// isn't actually sitting on a street. Shape borrowed from Justin Ormont's
// burningman-addressing (MIT): Man-side/Mountain-side, between-street, and a
// distance readout out in the deep playa.

/** A camp the readout may mention by name. */
export interface NearbyCamp { name: string, lat: number, lng: number }

const M_TO_FT = 3.28084
const ON_STREET_M = 20 // within this of a ring centreline, you're "on" that street
const SIDE_M = 8 // beyond this, worth saying which side of the street
const CAMP_NEAR_M = 60 // close enough to name a camp
const OUTSIDE_CITY_M = 150 // past K by this much and you're in the open playa

/**
 * Just the clock part of an address, e.g. "7:30". The bearing model wraps 12:00
 * round to 0, which is fine arithmetic and wrong on a clock face — nobody out
 * there says "0:00 and Kundalini".
 */
function clockLabel(time: number): string {
  const s = formatAddress({ time, street: 'Esplanade' }).split(' &')[0]!
  return s.startsWith('0:') ? `12:${s.slice(2)}` : s
}

/** Metres from the Man. */
export function radiusFromMan({ lat, lng }: LatLng): number {
  const x = (lng - MAN.lng) * mPerDegLng(MAN.lat)
  const y = (lat - MAN.lat) * M_PER_DEG_LAT
  return Math.hypot(x, y)
}

/** The two lettered streets bracketing a radius, innermost first. */
function bracketingStreets(radius: number): [string, string] | null {
  const entries = Object.entries(STREET_RADII)
  for (let i = 0; i < entries.length - 1; i++) {
    const [inner, rIn] = entries[i]!
    const [outer, rOut] = entries[i + 1]!
    if (radius >= rIn && radius <= rOut)
      return [inner, outer]
  }
  return null
}

/** The closest camp within CAMP_NEAR_M, or null. */
export function nearestCamp(point: LatLng, camps: NearbyCamp[]): NearbyCamp | null {
  const mLng = mPerDegLng(MAN.lat)
  let best: NearbyCamp | null = null
  let bestD = CAMP_NEAR_M
  for (const c of camps) {
    const d = Math.hypot((c.lng - point.lng) * mLng, (c.lat - point.lat) * M_PER_DEG_LAT)
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return best
}

/**
 * Human readout for a GPS fix, e.g. "near 7:30 & Eternal, Mountain-side".
 * Pass `camps` to let it add "— near Camp Name" when the fix is on top of one.
 */
export function describeLatLng(point: LatLng, camps: NearbyCamp[] = []): string {
  const addr = latLngToAddress(point)
  const radius = radiusFromMan(point)
  const camp = nearestCamp(point, camps)
  const tail = camp ? ` — near ${camp.name}` : ''
  const outerRadius = STREET_RADII[Object.keys(STREET_RADII)[Object.keys(STREET_RADII).length - 1]!]!

  // Deep playa: outside the city arc, or well past the outermost street. Give a
  // clock bearing and a distance, which is the only useful thing out there.
  if (addr.time < CITY_TIME_MIN - 0.5 || addr.time > CITY_TIME_MAX + 0.5
    || radius > outerRadius + OUTSIDE_CITY_M) {
    const ft = Math.round(radius * M_TO_FT / 10) * 10
    return `in the open playa — ${clockLabel(addr.time)}, ${ft.toLocaleString('en-US')} ft out${tail}`
  }

  // Mid-block: name both streets rather than pretending to be on the nearer one.
  if (addr.distanceM > ON_STREET_M) {
    const pair = bracketingStreets(radius)
    if (pair) {
      return `near ${clockLabel(addr.time)}, between ${streetName(pair[0])} and ${streetName(pair[1])}${tail}`
    }
  }

  // On a street. Once you're off the centreline by more than a few metres, which
  // side you're on is the difference between two facing rows of camps.
  const side = addr.distanceM > SIDE_M
    ? (radius < STREET_RADII[addr.street]! ? ', Man-side' : ', Mountain-side')
    : ''
  return `near ${formatAddressNamed(addr)}${side}${tail}`
}
