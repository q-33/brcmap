import { asc, gte } from 'drizzle-orm'
import { events } from '../../db/schema'

// Public: upcoming events with their hosting camp (name + current location).
// ?all=1 includes past events. Ordered by start time.
export default defineEventHandler(async (event) => {
  const includeAll = getQuery(event).all === '1'
  const db = useDb()
  // "now" as a playa wall-clock string for comparing against timestamp column
  const nowIso = new Date().toISOString().slice(0, 19)

  return db.query.events.findMany({
    where: includeAll ? undefined : gte(events.startsAt, nowIso),
    orderBy: [asc(events.startsAt)],
    limit: 500,
    with: {
      camp: {
        columns: { id: true, name: true },
        with: { locations: { columns: { addressString: true, createdAt: true } } },
      },
    },
  })
})
