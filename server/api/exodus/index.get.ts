import { desc, gte } from 'drizzle-orm'
import { freshReports, medianWait } from '~~/lib/exodus'
import { exodusReports } from '../../db/schema'
import { fetchBmanTraffic } from '../../utils/bmanTraffic'

// The exodus picture: crowd-reported Gate Road times (ours, reliable) and the
// org's @bmantraffic posts (theirs, best-effort — X may refuse, and the page
// degrades to a link).
//
// Two cache lives on purpose. The crowd meter runs at one minute, because the
// documented exodus failure mode is the line changing faster than anyone
// reports it. The X fetch hides behind its own ten-minute cache — hammering a
// rate-limited endpoint six times a minute is how you lose it for good.
const officialCached = defineCachedFunction(fetchBmanTraffic, {
  maxAge: 600,
  swr: true,
  name: 'bmantraffic',
  getKey: () => 'timeline',
})

export default defineCachedEventHandler(async () => {
  const now = Date.now()
  let reports: { minutes: number, at: number }[] = []
  try {
    const rows = await useDb()
      .select({ minutes: exodusReports.minutes, createdAt: exodusReports.createdAt })
      .from(exodusReports)
      .where(gte(exodusReports.createdAt, new Date(now - 3 * 3600_000)))
      .orderBy(desc(exodusReports.createdAt))
      .limit(500)
    reports = rows.map(r => ({ minutes: r.minutes, at: r.createdAt.getTime() }))
  }
  catch {
    // table missing (pre-migration) — the crowd meter just reads "no reports"
  }

  const fresh = freshReports(reports, now)
  const official = await officialCached()

  return {
    crowd: {
      median: medianWait(fresh),
      count: fresh.length,
      newestAt: fresh.length ? Math.max(...fresh.map(r => r.at)) : null,
      recent: fresh.slice(0, 40),
    },
    official, // TrafficPost[] | null — null means "X said no today"
    updatedAt: new Date(now).toISOString(),
  }
}, { maxAge: 60, swr: true, name: 'exodus', getKey: () => 'all' })
