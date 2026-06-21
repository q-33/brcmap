import { desc } from 'drizzle-orm'
import { contentReports } from '../../db/schema'

// Admin: list content reports (open first), enriched with the reported item's
// name + the reporter.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()

  const rows = await db.query.contentReports.findMany({
    orderBy: [desc(contentReports.createdAt)],
    limit: 200,
    with: { reporter: { columns: { email: true, displayName: true } } },
  })

  // resolve content names in two small batched lookups
  const campIds = rows.filter(r => r.contentType === 'camp').map(r => r.contentId)
  const artIds = rows.filter(r => r.contentType === 'art').map(r => r.contentId)
  const [campRows, artRows] = await Promise.all([
    campIds.length ? db.query.camps.findMany({ columns: { id: true, name: true }, where: (c, { inArray }) => inArray(c.id, campIds) }) : [],
    artIds.length ? db.query.art.findMany({ columns: { id: true, name: true }, where: (a, { inArray }) => inArray(a.id, artIds) }) : [],
  ])
  const names = new Map<string, string>()
  for (const c of campRows) names.set(c.id, c.name)
  for (const a of artRows) names.set(a.id, a.name)

  return rows.map(r => ({
    id: r.id,
    contentType: r.contentType,
    contentId: r.contentId,
    contentName: names.get(r.contentId) ?? '(deleted)',
    reason: r.reason,
    status: r.status,
    reporter: r.reporter?.email ?? null,
    createdAt: r.createdAt,
  }))
})
