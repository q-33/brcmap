import { desc, gte, or, eq, and } from 'drizzle-orm'
import { CLEANED_LINGER_MS } from '~~/lib/moop'
import { moopReports } from '../../db/schema'

// Public: every open MOOP pin, plus pins swept within the last day so a crew
// can see the line's progress. No visitor hashes leave the server.
export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db
    .select({
      id: moopReports.id,
      lat: moopReports.lat,
      lng: moopReports.lng,
      category: moopReports.category,
      note: moopReports.note,
      status: moopReports.status,
      cleanedAt: moopReports.cleanedAt,
      createdAt: moopReports.createdAt,
    })
    .from(moopReports)
    .where(or(
      eq(moopReports.status, 'open'),
      and(eq(moopReports.status, 'cleaned'), gte(moopReports.cleanedAt, new Date(Date.now() - CLEANED_LINGER_MS))),
    ))
    .orderBy(desc(moopReports.createdAt))
    .limit(2000)
  return rows
})
