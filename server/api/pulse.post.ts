import { PULSE_BUCKET_MINUTES, bucketOf } from '~~/lib/pulse'
import { usagePulse } from '../db/schema'
import { visitorFromEvent } from '../utils/pulse'

// Record that somebody is out there, without recording who.
//
// The visitor key is sha256(random daily salt + playa date + IP + user agent);
// see server/utils/pulse.ts for why the salt lives only in memory. The IP never
// lands in the database and the key changes at playa midnight.
//
// Fails silently on purpose. A metrics write must never be the reason a page
// errors, and out there half these requests die on a hotspot anyway.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ path?: string }>(event).catch(() => ({} as { path?: string }))
  const raw = typeof body?.path === 'string' ? body.path : '/'
  // Only ever our own route shapes, capped — this string is written to the
  // database and read back into the admin panel.
  const path = raw.split('?')[0]!.slice(0, 120) || '/'

  const visitor = visitorFromEvent(event)

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
