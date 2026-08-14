// Wildfire and smoke helpers for the Live page.
//
// We are NOT an emergency authority. Evacuation orders come from county sheriffs
// and emergency managers and change by the hour, so this module never decides
// whether anywhere is evacuated. It reports what official feeds say, with a
// timestamp, and everything it renders links back to the agency that issued it.

import { windDir } from './weather'

/** Black Rock City, for distances. The golden spike is close enough at this scale. */
export const BRC = { lat: 40.7864, lng: -119.2065 }

const M_PER_DEG_LAT = 111.32 // km

export interface FireIncident {
  name: string
  /** kilometres from BRC */
  km: number
  /** compass bearing FROM BRC toward the fire, e.g. "SW" */
  bearing: string
  acres: number | null
  contained: number | null
  county: string | null
  state: string | null
  /** epoch ms when the fire was discovered */
  discovered: number | null
  cause: string | null
}

export interface FireAlert {
  event: string
  severity: string | null
  urgency: string | null
  headline: string | null
  area: string | null
  /** ISO */
  ends: string | null
  url: string | null
}

export interface AirNow {
  usAqi: number | null
  pm25: number | null
  /** worst US AQI in the next 24 h, when the forecast has one */
  aqiNext24: number | null
}

/** Great-circle-ish distance in km. Flat earth is fine over a few hundred km. */
export function kmBetween(a: { lat: number, lng: number }, b: { lat: number, lng: number }): number {
  const dy = (b.lat - a.lat) * M_PER_DEG_LAT
  const dx = (b.lng - a.lng) * M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

/** Compass point from one place toward another (16-point, same table as wind). */
export function bearingBetween(from: { lat: number, lng: number }, to: { lat: number, lng: number }): string {
  const dy = (to.lat - from.lat) * M_PER_DEG_LAT
  const dx = (to.lng - from.lng) * M_PER_DEG_LAT * Math.cos((from.lat * Math.PI) / 180)
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI
  return windDir((deg + 360) % 360)
}

/**
 * US AQI band. Thresholds and colours are the EPA's own, so a reading here means
 * the same thing it means on airnow.gov.
 */
export function aqiBand(aqi: number | null | undefined): { label: string, color: string, advice: string } {
  if (aqi == null || !Number.isFinite(aqi))
    return { label: 'Unknown', color: '#6b7280', advice: 'No reading right now.' }
  if (aqi <= 50)
    return { label: 'Good', color: '#16a34a', advice: 'Air is clean.' }
  if (aqi <= 100)
    return { label: 'Moderate', color: '#65a30d', advice: 'Fine for most people; unusually sensitive folks may notice it.' }
  if (aqi <= 150)
    return { label: 'Unhealthy for sensitive groups', color: '#d97706', advice: 'Mask up if you have asthma or a heart condition.' }
  if (aqi <= 200)
    return { label: 'Unhealthy', color: '#dc2626', advice: 'Everyone should limit hard exertion. N95, not a bandana.' }
  if (aqi <= 300)
    return { label: 'Very unhealthy', color: '#9333ea', advice: 'Stay inside a vehicle or structure where you can.' }
  return { label: 'Hazardous', color: '#7f1d1d', advice: 'Avoid being outside. Follow official guidance.' }
}

/** Alerts we surface in the fire section rather than the weather one. */
const FIRE_EVENTS = [
  'red flag',
  'fire weather',
  'smoke',
  'air quality',
  'evacuation',
  'ashfall',
]

export function isFireRelated(event: string | null | undefined): boolean {
  const e = (event ?? '').toLowerCase()
  return FIRE_EVENTS.some(k => e.includes(k))
}

/**
 * Order by what can still hurt you, not by distance alone. A fully contained
 * fire 20 km away is less use to a burner than a 57,000-acre uncontained one at
 * 140 km, so containment sorts first, then distance, then size.
 */
export function byThreat(a: FireIncident, b: FireIncident): number {
  const done = (f: FireIncident) => (f.contained ?? 0) >= 100
  if (done(a) !== done(b))
    return done(a) ? 1 : -1
  if (Math.abs(a.km - b.km) > 0.5)
    return a.km - b.km
  return (b.acres ?? 0) - (a.acres ?? 0)
}

/** "57,363 acres · 0% contained" — omits parts the feed hasn't filled in. */
export function describeIncident(f: FireIncident): string {
  const bits: string[] = []
  if (f.acres != null)
    bits.push(`${Math.round(f.acres).toLocaleString('en-US')} acres`)
  if (f.contained != null)
    bits.push(`${Math.round(f.contained)}% contained`)
  return bits.join(' · ')
}
