// RideFinder (https://ridefinder.site) — the other Burning Man rideshare board.
// Separate site for now; the plan is a real integration next year. Until then we
// MIRROR their public listings read-only, so a burner looking for a ride here
// sees the whole picture, and contact happens on their site where the poster
// actually is.
//
// This file is the seam next year's integration slots into: everything that
// knows their schema lives here, and the mapper is pure so it stays testable.
// If their API grows auth, write paths, or a partnership feed, only this file
// and the proxy endpoint should have to change.
//
// Mirroring rules, same spirit as the BM imports:
//   · read-only, and LIVE — a short-cache proxy, never a database copy, so
//     their cancellations and expiries propagate in minutes and we never hold
//     a stale copy of somebody's plans
//   · no PII beyond what their public board already shows (display name, city,
//     camp address); contact stays on their site, one click away
//   · expired and cancelled listings are dropped before anything leaves the
//     server

import { ofetch } from 'ofetch'

/** Their listing, as served by GET https://ridefinder.site/api/listings */
export interface RfListing {
  id: string
  type: 'rider' | 'driver'
  direction: 'to_brc' | 'from_brc'
  name: string
  location: string | null
  travelDate: string | null // YYYY-MM-DD
  timeSlot: string | null // 'flexible' | 'morning' | …
  details: string | null
  campInfo: string | null
  passengerSpace: number | null
  cargoSpace: string | null
  routeDetails: string | null
  riderStuff: string | null
  expiresAt: string | null
  cancelledAt: string | null
  createdAt: string
}

/** What our /rides page renders — deliberately close to our own Ride shape. */
export interface MirroredRide {
  id: string
  kind: 'offer' | 'request'
  direction: 'to_brc' | 'from_brc'
  destination: string
  departs: string | null
  seats: number | null
  luggage: string | null
  fromLocation: string | null
  note: string | null
  poster: string
  url: string
  createdAt: string
}

const NICE_SLOT: Record<string, string> = {
  flexible: 'flexible',
  morning: 'morning',
  midday: 'midday',
  afternoon: 'afternoon',
  evening: 'evening',
  night: 'night',
}

/** "2026-09-06" → "Sun, Sep 6" — their dates are plain calendar days. */
function niceDate(d: string): string {
  const t = Date.parse(`${d}T12:00:00-07:00`) // noon Pacific dodges every DST/UTC edge
  return Number.isFinite(t)
    ? new Date(t).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' })
    : d
}

/**
 * Their listing → our display shape. Pure, so the suite can pin it.
 * Returns null for anything that should not be shown: cancelled, expired,
 * or too malformed to render honestly.
 */
export function mapRfListing(l: RfListing, nowMs: number): MirroredRide | null {
  if (l.cancelledAt)
    return null
  if (l.expiresAt && Date.parse(l.expiresAt) < nowMs)
    return null
  if (!l.id || !l.name)
    return null

  // Their model is direction + home city; ours is a destination string.
  const city = l.location?.trim() || 'somewhere off playa'
  const destination = l.direction === 'to_brc' ? `Black Rock City (from ${city})` : city

  const departs = [
    l.travelDate ? niceDate(l.travelDate) : null,
    l.timeSlot && l.timeSlot !== 'flexible' ? (NICE_SLOT[l.timeSlot] ?? l.timeSlot) : null,
  ].filter(Boolean).join(', ') || null

  return {
    id: l.id,
    kind: l.type === 'driver' ? 'offer' : 'request',
    direction: l.direction,
    destination,
    departs,
    seats: l.type === 'driver' ? l.passengerSpace ?? null : null,
    luggage: l.type === 'rider' ? l.riderStuff ?? null : null,
    fromLocation: l.campInfo?.trim() || null,
    note: [l.details?.trim(), l.routeDetails ? `Route: ${l.routeDetails.trim()}` : null]
      .filter(Boolean).join('\n') || null,
    poster: l.name,
    url: `https://ridefinder.site/listing/${l.id}`,
    createdAt: l.createdAt,
  }
}

/** The live board, mapped and filtered. Throws on network failure — the proxy decides how to degrade. */
export async function fetchRideFinder(nowMs: number): Promise<MirroredRide[]> {
  const res = await ofetch<{ listings?: RfListing[] }>('https://ridefinder.site/api/listings', {
    timeout: 10_000,
    retry: 1,
    headers: { Accept: 'application/json' },
  })
  const rows = Array.isArray(res?.listings) ? res.listings : []
  return rows
    .map(l => mapRfListing(l, nowMs))
    .filter((r): r is MirroredRide => r !== null)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}
