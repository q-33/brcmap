import { asc, gte } from 'drizzle-orm'
import { events } from '../../db/schema'

// Public: upcoming events with their hosting camp (name + current location).
// ?all=1 includes past events. Ordered by start time.
export default defineEventHandler(async (event) => {
  const includeAll = getQuery(event).all === '1'
  const db = useDb()
  // "now" as a playa wall-clock string for comparing against timestamp column
  const nowIso = new Date().toISOString().slice(0, 19)

  const rows = await db.query.events.findMany({
    where: includeAll ? undefined : gte(events.startsAt, nowIso),
    orderBy: [asc(events.startsAt)],
    // Imported guides are hundreds of events each — QueerBurners alone is 296.
    // A cap here would silently drop the ones furthest out, the same way the
    // camps list quietly lost its oldest camp. Bounded, but not in the way.
    limit: 5000,
    with: {
      camp: {
        columns: { id: true, name: true, hidden: true },
        with: { locations: { columns: { addressString: true, createdAt: true } } },
      },
    },
  })
  // A moderated (hidden) camp's events must not re-surface its name/location.
  return rows
    .filter(r => !r.camp?.hidden)
    .map((r) => {
      const o = { ...r } as Record<string, any>
      if (o.camp) {
        o.camp = { ...o.camp }
        delete o.camp.hidden
      }
      return o
    })
})
