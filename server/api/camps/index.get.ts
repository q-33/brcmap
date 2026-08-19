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
    // Was 200, which silently dropped the OLDEST camps off the map once signups
    // passed that number — a camp that had been placed for weeks would vanish the
    // day someone else registered, and its owner could no longer edit it either,
    // because the page looks the camp up in this very list. Reported by a camp at
    // 9:30 & B whose row was fine the whole time.
    //
    // The map has to show every placed camp; a cap here is data loss, not paging.
    // Kept as a very high ceiling rather than removed so a runaway insert can
    // still never hand the browser an unbounded response.
    limit: 5000,
    with: {
      owner: { columns: { id: true, displayName: true } },
      locations: {
        columns: { addressString: true, gpsLatitude: true, gpsLongitude: true, createdAt: true },
      },
    },
  })
  // contactEmail is owner PII the public UI never displays — don't ship it over
  // the public API (contact goes through in-app messaging instead).
  return rows.map((c) => {
    const o = { ...c } as Record<string, unknown>
    delete o.contactEmail
    return o
  })
})
