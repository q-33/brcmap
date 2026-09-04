import { and, gte, sql } from 'drizzle-orm'
import { ACTIVE_WINDOW_MINUTES, hourSeries, hourSlot } from '~~/lib/pulse'
import { usagePulse } from '../../db/schema'

// Admin: is anyone using the map?
//
// Counts DISTINCT visitors, not rows — a tab left open all afternoon is one
// person, and a page that pings every five minutes must not look like a crowd.
// See lib/pulse.ts for what a "visitor" is and, more importantly, is not.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const now = Date.now()
  const series = hourSeries(now)
  const since24h = new Date(series[0]!)

  try {
    const rows = await db
      .select({ visitor: usagePulse.visitor, path: usagePulse.path, bucket: usagePulse.bucket })
      .from(usagePulse)
      .where(gte(usagePulse.bucket, since24h))

    const activeCut = now - ACTIVE_WINDOW_MINUTES * 60_000
    const activeNow = new Set<string>()
    const day = new Set<string>()
    const byHour: Set<string>[] = series.map(() => new Set<string>())
    const paths = new Map<string, Set<string>>()

    for (const r of rows) {
      const ms = r.bucket.getTime()
      day.add(r.visitor)
      if (ms >= activeCut)
        activeNow.add(r.visitor)
      const slot = hourSlot(ms, series)
      if (slot >= 0)
        byHour[slot]!.add(r.visitor)
      if (!paths.has(r.path))
        paths.set(r.path, new Set())
      paths.get(r.path)!.add(r.visitor)
    }

    return {
      available: true,
      activeNow: activeNow.size,
      last24h: day.size,
      hours: byHour.map((s, i) => ({ at: series[i]!, n: s.size })),
      topPaths: [...paths.entries()]
        .map(([path, s]) => ({ path, n: s.size }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 6),
    }
  }
  catch {
    // Before the migration runs there is no table; say so rather than 500ing
    // the whole admin dashboard over a stat line.
    return { available: false, activeNow: 0, last24h: 0, hours: [], topPaths: [] }
  }
})
