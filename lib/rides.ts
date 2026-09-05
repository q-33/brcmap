// Helpers for the rideshare rendezvous: two connected burners finding each
// other. Pure math, shared by the client panel and its tests.

export interface Point { lat: number, lng: number }

/** Great-circle metres between two points. Haversine; exact enough to walk by. */
export function distanceMeters(a: Point, b: Point): number {
  const R = 6371000
  const t = (d: number) => d * Math.PI / 180
  const dLat = t(b.lat - a.lat)
  const dLng = t(b.lng - a.lng)
  const q = Math.sin(dLat / 2) ** 2
    + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(q))
}

/** Initial bearing from a to b, degrees clockwise from true north. */
export function bearingDeg(a: Point, b: Point): number {
  const t = (d: number) => d * Math.PI / 180
  const dLng = t(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(t(b.lat))
  const x = Math.cos(t(a.lat)) * Math.sin(t(b.lat))
    - Math.sin(t(a.lat)) * Math.cos(t(b.lat)) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

/** "80 m" under a kilometre, "2.4 km" above — rendezvous precision, not survey. */
export function fmtDistance(m: number): string {
  if (m < 1000)
    return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`
}

/** "just now" / "40s ago" / "3 min ago" — how stale the other side's fix is. */
export function fmtAge(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 10)
    return 'just now'
  if (s < 90)
    return `${s}s ago`
  return `${Math.round(s / 60)} min ago`
}
