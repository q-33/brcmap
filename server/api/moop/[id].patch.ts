import { and, eq, gte, sql as dsql } from 'drizzle-orm'
import { z } from 'zod'
import { pacificDateOf } from '~~/lib/burns'
import { moopReports } from '../../db/schema'
import { visitorKey } from '../../utils/pulse'

const schema = z.object({ status: z.enum(['open', 'cleaned']) })

// Mark a pin swept (or re-open one that wasn't). Anonymous and reversible by
// design: the worst vandalism costs a re-check; an account wall would cost
// the reports themselves. Rate-limited like posting.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { status } = await readValidatedBody(event, schema.parse)

  const secret = (useRuntimeConfig().session?.password as string) || 'brcmap-pulse'
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const ua = getRequestHeader(event, 'user-agent') ?? 'unknown'
  const visitor = visitorKey(secret, pacificDateOf(Date.now()), ip, ua)

  const db = useDb()
  const [recent] = await db.select({ n: dsql<number>`count(*)::int` }).from(moopReports)
    .where(and(eq(moopReports.visitor, visitor), gte(moopReports.updatedAt, new Date(Date.now() - 10_000))))
  if ((recent?.n ?? 0) > 3)
    throw createError({ statusCode: 429, statusMessage: 'Slow down a touch.' })

  const [row] = await db.update(moopReports)
    .set(status === 'cleaned' ? { status, cleanedAt: new Date() } : { status, cleanedAt: null })
    .where(eq(moopReports.id, id))
    .returning({ id: moopReports.id, status: moopReports.status })
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'No such pin' })
  return row
})
