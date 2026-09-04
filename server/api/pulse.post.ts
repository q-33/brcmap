import { PULSE_BUCKET_MINUTES, bucketOf } from '~~/lib/pulse'
import { pacificDateOf } from '~~/lib/burns'
import { usagePulse } from '../db/schema'
import { visitorKey } from '../utils/pulse'

// Record that somebody is out there, without recording who.
//
// The visitor key is sha256(session secret + playa date + IP + user agent). The
// IP never lands in the database, the hash cannot be reversed, and the playa
// date inside it means the key changes at playa midnight — so the same person
// tomorrow is a different visitor and nobody can be followed across days.
//
// Fails silently on purpose. A metrics write must never be the reason a page
// errors, and out there half these requests die on a hotspot anyway.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ path?: string }>(event).catch(() => ({} as { path?: string }))
  const raw = typeof body?.path === 'string' ? body.path : '/'
  // Only ever our own route shapes, capped — this string is written to the
  // database and read back into the admin panel.
  const path = raw.split('?')[0]!.slice(0, 120) || '/'

  const secret = (useRuntimeConfig().session?.password as string) || 'brcmap-pulse'
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const ua = getRequestHeader(event, 'user-agent') ?? 'unknown'
  const day = pacificDateOf(Date.now())
  const visitor = visitorKey(secret, day, ip, ua)

  try {
    await useDb()
      .insert(usagePulse)
      .values({ visitor, path, bucket: bucketOf(Date.now(), PULSE_BUCKET_MINUTES) })
      .onConflictDoNothing()
  }
  catch {
    // table missing, database asleep — none of it is worth an error to the user
  }
  return { ok: true }
})
