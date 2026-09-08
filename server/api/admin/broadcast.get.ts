import { desc, eq, sql as dsql } from 'drizzle-orm'
import { broadcastRecipients, broadcasts } from '../../db/schema'

// Admin: the latest broadcast's delivery progress, for the Broadcast tab.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const [latest] = await db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).limit(1)
  if (!latest)
    return null
  const [counts] = await db
    .select({
      total: dsql<number>`count(*)::int`,
      sent: dsql<number>`count(*) filter (where status = 'sent')::int`,
      failed: dsql<number>`count(*) filter (where status = 'failed')::int`,
      queued: dsql<number>`count(*) filter (where status = 'queued')::int`,
    })
    .from(broadcastRecipients)
    .where(eq(broadcastRecipients.broadcastId, latest.id))
  return { id: latest.id, subject: latest.subject, createdAt: latest.createdAt, ...counts }
})
