import { and, desc, gte } from 'drizzle-orm'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { pacificDateOf } from '~~/lib/burns'
import { exodusReports } from '../../db/schema'
import { visitorKey } from '../../utils/pulse'

const schema = z.object({ minutes: z.number().int().min(0).max(720) })

// One tap from the line: "Gate Road is taking about this long right now."
//
// No account needed — nobody registers from a stopped car — but the same
// daily-rotating anonymous hash the pulse uses gets one report per half hour,
// so a bored back seat cannot vote twelve times. No location is read or
// stored; the report is the number and the moment, nothing else.
export default defineEventHandler(async (event) => {
  const { minutes } = await readValidatedBody(event, schema.parse)

  const secret = (useRuntimeConfig().session?.password as string) || 'brcmap-pulse'
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const ua = getRequestHeader(event, 'user-agent') ?? 'unknown'
  const visitor = visitorKey(secret, pacificDateOf(Date.now()), ip, ua)

  const db = useDb()
  const [recent] = await db
    .select({ id: exodusReports.id })
    .from(exodusReports)
    .where(and(
      eq(exodusReports.visitor, visitor),
      gte(exodusReports.createdAt, new Date(Date.now() - 30 * 60_000)),
    ))
    .orderBy(desc(exodusReports.createdAt))
    .limit(1)
  if (recent) {
    throw createError({
      statusCode: 429,
      statusMessage: 'You reported recently — the line will still be there in half an hour.',
    })
  }

  await db.insert(exodusReports).values({ visitor, minutes })
  return { ok: true }
})
