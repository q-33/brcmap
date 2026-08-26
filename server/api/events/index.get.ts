import { and, asc, gte, inArray, sql } from 'drizzle-orm'
import { events } from '../../db/schema'
import { DEFAULT_ON, EVENT_SOURCE_KEYS } from '~~/lib/eventSources'

// Public: upcoming events, with their hosting camp where there is one.
//
//   ?all=1          include events that have already started
//   ?sources=a,b    only these guides (default: the ones on by default)
//
// FILTERED SERVER-SIDE, deliberately. Burning Man's own directory is 6,500
// occurrences — about 1.3 MB — and the page used to fetch everything and hide
// what was switched off. That is a lot of playa LTE spent on events nobody
// asked to see. The client now sends the guides it has switched on.
//
// Counts for every guide come back regardless, because the toggles have to say
// what they WOULD add. That is one cheap grouped count, not another payload.
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const includeAll = q.all === '1'
  const db = useDb()
  const nowIso = new Date().toISOString().slice(0, 19)

  const asked = typeof q.sources === 'string' && q.sources.trim()
    ? q.sources.split(',').map(s => s.trim()).filter(s => EVENT_SOURCE_KEYS.includes(s))
    : DEFAULT_ON
  // Asking for nothing means nothing — not everything.
  const wanted = asked.length ? asked : ['__none__']

  const counts = await db
    .select({ source: events.source, n: sql<number>`count(*)::int` })
    .from(events)
    .where(includeAll ? undefined : gte(events.startsAt, nowIso))
    .groupBy(events.source)

  const rows = await db.query.events.findMany({
    where: and(
      includeAll ? undefined : gte(events.startsAt, nowIso),
      inArray(events.source, wanted),
    ),
    orderBy: [asc(events.startsAt)],
    limit: 8000,
    with: {
      camp: {
        columns: { id: true, name: true, hidden: true },
        with: { locations: { columns: { addressString: true, createdAt: true } } },
      },
    },
  })

  // A moderated (hidden) camp's events must not re-surface its name/location.
  const list = rows
    .filter(r => !r.camp?.hidden)
    .map((r) => {
      const o = { ...r } as Record<string, any>
      if (o.camp) {
        o.camp = { ...o.camp }
        delete o.camp.hidden
      }
      return o
    })

  return {
    events: list,
    counts: Object.fromEntries(counts.map(c => [c.source, c.n])),
  }
})
