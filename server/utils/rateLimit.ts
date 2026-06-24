import type { H3Event } from 'h3'

// Simple in-memory fixed-window rate limiter, keyed by a label + the client IP
// (or an explicit id, e.g. a user id or email). DigitalOcean App Platform runs a
// single instance by default, so per-process state is sufficient to blunt
// brute-force / spam; back this with shared storage (KV/Redis) if you scale out.
const buckets = new Map<string, number[]>()

export function rateLimit(event: H3Event, label: string, max: number, windowMs: number, id?: string): void {
  const who = id ?? getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const key = `${label}:${who}`
  const now = Date.now()
  const hits = (buckets.get(key) ?? []).filter(t => now - t < windowMs)
  if (hits.length >= max)
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts — please wait a minute and try again.' })
  hits.push(now)
  buckets.set(key, hits)

  // Opportunistic cleanup so the map can't grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every(t => now - t >= windowMs))
        buckets.delete(k)
    }
  }
}
