import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { camps } from '../../db/schema'

// Public: list camps with their locations. Optional ?q= filters by name /
// description / hometown (case-insensitive substring) — Postgres-native search,
// no external index.
export default defineEventHandler(async (event) => {
  const q = getQuery(event).q
  const term = typeof q === 'string' ? q.trim() : ''
  const db = useDb()

  const search = term
    ? or(
        ilike(camps.name, `%${term}%`),
        ilike(camps.description, `%${term}%`),
        ilike(camps.hometown, `%${term}%`),
      )
    : undefined
  // Hidden (admin-moderated) camps never appear in public listings.
  const where = and(eq(camps.hidden, false), search)

  const rows = await db.query.camps.findMany({
    where,
    orderBy: [desc(camps.createdAt)],
    limit: 200,
    with: {
      locations: {
        columns: { addressString: true, gpsLatitude: true, gpsLongitude: true, createdAt: true },
      },
    },
  })
  return rows
})
