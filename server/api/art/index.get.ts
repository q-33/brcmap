import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { art } from '../../db/schema'

// Public: list art installations with their locations. Optional ?q= filters by
// name / description / hometown (case-insensitive substring).
export default defineEventHandler(async (event) => {
  const q = getQuery(event).q
  const term = typeof q === 'string' ? q.trim() : ''
  const db = useDb()

  const search = term
    ? or(
        ilike(art.name, `%${term}%`),
        ilike(art.description, `%${term}%`),
        ilike(art.hometown, `%${term}%`),
      )
    : undefined
  // Hidden (admin-moderated) art never appears in public listings.
  const where = and(eq(art.hidden, false), search)

  const rows = await db.query.art.findMany({
    where,
    orderBy: [desc(art.createdAt)],
    // Holds the full official art listing (250+ pieces) plus community submissions.
    limit: 600,
    with: {
      locations: {
        columns: { addressString: true, gpsLatitude: true, gpsLongitude: true, createdAt: true },
      },
    },
  })
  // Don't ship owner PII (contactEmail) or the unused legacy url over the public API.
  return rows.map((a) => {
    const o = { ...a } as Record<string, unknown>
    delete o.contactEmail
    delete o.url
    return o
  })
})
