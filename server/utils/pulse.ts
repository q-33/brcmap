import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { pacificDateOf } from '../../lib/burns'
import { clientIp } from './clientIp'

/**
 * The opaque key an anonymous row (usage pulse, exodus report, MOOP pin) is
 * stored under.
 *
 * Server-only, and deliberately not in lib/: it is the one piece of this that
 * touches an IP address, and it should be impossible to import into anything
 * that ships to a browser.
 *
 * Privacy design, stated plainly:
 *
 *   · The playa date is INSIDE the hash, so the same person on the same network
 *     gets a different key tomorrow. Nobody is followed across days.
 *   · The salt is RANDOM, generated in memory the first time a day is seen, and
 *     never written anywhere. Before 2026-10 the "secret" was the long-lived
 *     session password (with a hard-coded fallback in this public repo), which
 *     meant whoever held it could recompute any past day's key from an IP and
 *     user agent — a server log plus this table was a trail. A salt that exists
 *     only in process memory for ~2 days cannot be replayed by anyone, including
 *     us, once the process restarts.
 *   · The honest cost: a restart mid-day mints a new salt, so that day's
 *     visitors are counted twice (before/after). Counts read a little high on
 *     deploy days. That is the right direction to be wrong in.
 *
 * Nothing reversible is stored — no IP, no user agent, no cookie.
 */
export function visitorKey(salt: string, playaDate: string, ip: string, userAgent: string): string {
  return createHash('sha256')
    .update(`${salt}:${playaDate}:${ip}:${userAgent}`)
    .digest('hex')
    .slice(0, 32)
}

// One salt per playa day, kept for today and yesterday only so a request that
// straddles midnight still resolves; older days are forgotten on purpose.
const salts = new Map<string, string>()

export function dailySalt(playaDate: string): string {
  let s = salts.get(playaDate)
  if (!s) {
    s = randomBytes(16).toString('hex')
    salts.set(playaDate, s)
    for (const k of [...salts.keys()].sort().slice(0, -2))
      salts.delete(k)
  }
  return s
}

/** The anonymous visitor key for this request, today. */
export function visitorFromEvent(event: H3Event, now: number = Date.now()): string {
  const day = pacificDateOf(now)
  const ua = getRequestHeader(event, 'user-agent') ?? 'unknown'
  return visitorKey(dailySalt(day), day, clientIp(event), ua)
}
