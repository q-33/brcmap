// Parametric Black Rock City geocoder — address <-> lat/lng as pure math, no
// shipped per-year GeoJSON, works fully offline. Constants were fitted from the
// 2023 city block geometry (mean error ~35 m vs block centroids) and can be
// swapped per year as Burning Man publishes the survey.
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
// Each year the Bureau of Land Management survey crew drives a "golden spike"
// into the playa at the exact center of Black Rock City — the base of the Man.
// Every address in this file is computed relative to it, so this ONE coordinate
// re-snaps the entire city (geocoding AND the drawn map) when updated.
//
// 2026's spike has not been surveyed/published yet. `GOLDEN_SPIKE` is the
// standing reference (the 2023-fitted Man position). The moment Burning Man
// publishes the real 2026 coordinate, set GOLDEN_SPIKE_2026 below to it — that
// single line re-aligns the whole map. Nothing else needs to change.
// Optional compile-time pin for the 2026 spike. Leave null to use the runtime
// override (NUXT_PUBLIC_GOLDEN_SPIKE env) or, failing that, the fallback estimate.
export const GOLDEN_SPIKE_2026: LatLng | null = null
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
const BEARING_INTERCEPT = 40.253
const BEARING_PER_HOUR = 29.98

// Fitted centroid radius (metres) per street, innermost -> outermost. These are
// the real, to-scale distances from the Man — the single source of truth for
// both geocoding (address <-> GPS) and drawing the city. They must NOT be
// stylised/compressed: doing so makes camp pins disagree with the device's real
// GPS dot and misreports the street by 1-2 rings in the inner city.
export const STREET_RADII: Record<string, number> = {
  Esplanade: 792.2,
  A: 880.9,
  B: 980.4,
  C: 1068.4,
  D: 1156.4,
  E: 1259.6,
  F: 1382.9,
  G: 1486.4,
  H: 1574.8,
  I: 1655.5,
  J: 1721.0,
  K: 1778.9,
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

/** Human readout for a GPS fix, e.g. "near 7:30 & Eternal". */
export function describeLatLng(point: LatLng): string {
  const addr = latLngToAddress(point)
  if (addr.time < CITY_TIME_MIN - 0.5 || addr.time > CITY_TIME_MAX + 0.5)
    return 'in the open playa'
  return `near ${formatAddressNamed(addr)}`
}
