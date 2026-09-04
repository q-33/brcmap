// Usage metrics, in the smallest shape that answers "is anyone out there".
//
// WHAT THIS DELIBERATELY IS NOT: a third-party analytics script. Those cost a
// DNS lookup, a script download and a beacon on a hotspot shared by a camp, and
// they ship a burner's browsing to a company that has nothing to do with any of
// this. The whole thing here is one tiny POST to our own server.
//
// WHO SOMEONE IS, we do not keep. The server hashes (secret + playa date + IP +
// user agent) into an opaque key and stores THAT. It cannot be reversed into an
// IP, and because the playa date is in the hash it changes at playa midnight —
// so the same person tomorrow is a different key, and nobody can be followed
// across days. No cookie, no localStorage id, nothing to opt out of because
// there is nothing persistent to opt out from.
//
// The cost of that choice, stated plainly: "visitors today" is really "distinct
// browsers on this network today", and two people on one camp's Starlink behind
// the same NAT with the same phone look like one. For deciding whether the map
// is being used at all, that is the right trade.

/** Rows are deduplicated per visitor, per path, per this many minutes. */
export const PULSE_BUCKET_MINUTES = 1

/** How recently a visitor must have pinged to count as here right now. */
export const ACTIVE_WINDOW_MINUTES = 5

/**
 * Floor a timestamp to its bucket. Every ping inside the same minute collapses
 * onto one row, so a tab left open for an hour writes 60 rows rather than one
 * per heartbeat — and the unique index makes the collapse the database's job
 * rather than something the client has to be trusted to get right.
 */
export function bucketOf(ms: number, minutes: number = PULSE_BUCKET_MINUTES): Date {
  const size = minutes * 60_000
  return new Date(Math.floor(ms / size) * size)
}

/**
 * The hour labels for a 24-hour activity strip, oldest first, ending with the
 * hour we are in. Returned as epoch ms so the caller can bucket against them
 * without re-deriving the boundaries.
 */
export function hourSeries(nowMs: number, hours = 24): number[] {
  const top = Math.floor(nowMs / 3_600_000) * 3_600_000
  return Array.from({ length: hours }, (_, i) => top - (hours - 1 - i) * 3_600_000)
}

/** Which slot of hourSeries() a timestamp belongs to, or -1 if it is off the end. */
export function hourSlot(ms: number, series: number[]): number {
  if (!series.length)
    return -1
  const first = series[0]!
  const i = Math.floor((ms - first) / 3_600_000)
  return i >= 0 && i < series.length ? i : -1
}
