import type { H3Event } from 'h3'

// Which header carries the real client address. On DigitalOcean App Platform the
// ingress sets `do-connecting-ip` and a client cannot forge it. If something
// else fronts the app (Cloudflare: `cf-connecting-ip`), set CLIENT_IP_HEADER to
// that header's name — and only to a header the fronting proxy OVERWRITES, never
// one it merely forwards.
const TRUSTED_HEADER = (process.env.CLIENT_IP_HEADER || 'do-connecting-ip').toLowerCase()

/**
 * The address to rate-limit and hash by, chosen from the request headers.
 *
 * Why not `getRequestIP(event, { xForwardedFor: true })`: h3 takes the FIRST
 * hop of X-Forwarded-For, and the first hop is whatever the client typed. One
 * header per request defeated every per-IP limit on the site. Here:
 *
 *   1. the trusted platform header, if present;
 *   2. otherwise the LAST hop of X-Forwarded-For — the one the nearest proxy
 *      appended, which the client did not write;
 *   3. otherwise the socket address.
 */
export function clientIpFromHeaders(headers: Record<string, string | undefined>, socketIp?: string): string {
  const trusted = headers[TRUSTED_HEADER]?.trim()
  if (trusted)
    return trusted
  const xff = headers['x-forwarded-for']
  if (xff) {
    const hops = xff.split(',').map(s => s.trim()).filter(Boolean)
    const last = hops[hops.length - 1]
    if (last)
      return last
  }
  return socketIp?.trim() || 'unknown'
}

export function clientIp(event: H3Event): string {
  const h = getRequestHeaders(event) as Record<string, string | undefined>
  return clientIpFromHeaders(h, getRequestIP(event))
}
