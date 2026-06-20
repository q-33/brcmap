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

// --- Fitted constants (2023) -------------------------------------------------
export const MAN: LatLng = { lat: 40.786394, lng: -119.203492 }

// bearing(deg, clockwise from north) = BEARING_INTERCEPT + BEARING_PER_HOUR * time
const BEARING_INTERCEPT = 40.253
const BEARING_PER_HOUR = 29.98

// centroid radius (metres) per street, innermost -> outermost
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

const M_PER_DEG_LAT = 111320
const mPerDegLng = (lat: number) => M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180)
const toRad = (d: number) => (d * Math.PI) / 180
const toDeg = (r: number) => (r * 180) / Math.PI

// --- Forward: address -> lat/lng --------------------------------------------
export function addressToLatLng({ time, street }: BrcAddress): LatLng | null {
  const radius = STREET_RADII[street]
  if (radius == null)
    return null
  const bearing = toRad(BEARING_INTERCEPT + BEARING_PER_HOUR * time)
  const x = radius * Math.sin(bearing) // east (m)
  const y = radius * Math.cos(bearing) // north (m)
  return {
    lat: MAN.lat + y / M_PER_DEG_LAT,
    lng: MAN.lng + x / mPerDegLng(MAN.lat),
  }
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

/** Human readout for a GPS fix, e.g. "near 7:30 & E". */
export function describeLatLng(point: LatLng): string {
  const addr = latLngToAddress(point)
  if (addr.time < CITY_TIME_MIN - 0.5 || addr.time > CITY_TIME_MAX + 0.5)
    return 'in the open playa'
  return `near ${formatAddress(addr)}`
}
