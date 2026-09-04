import { createHash } from 'node:crypto'

/**
 * The opaque key a usage row is stored under.
 *
 * Server-only, and deliberately not in lib/: it is the one piece of this that
 * touches an IP address, and it should be impossible to import into anything
 * that ships to a browser.
 *
 * The playa date is INSIDE the hash. That is the whole privacy design: the same
 * person on the same network gets a different key tomorrow, so the table cannot
 * be used to follow anyone across days even by whoever runs the server. Nothing
 * reversible is stored — no IP, no user agent, no cookie.
 */
export function visitorKey(secret: string, playaDate: string, ip: string, userAgent: string): string {
  return createHash('sha256')
    .update(`${secret}:${playaDate}:${ip}:${userAgent}`)
    .digest('hex')
    .slice(0, 32)
}
