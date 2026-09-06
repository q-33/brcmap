import { gte } from 'drizzle-orm'
import { ACTIVE_WINDOW_MINUTES, hourSeries, hourSlot } from '~~/lib/pulse'
import { usagePulse } from '../../db/schema'

// Admin: is anyone using the site — and is anyone using the mesh?
//
// Counts DISTINCT visitors, never rows. Rows whose "path" starts with `mesh:`
// are not pages: they are the anonymous mesh-radio pings from useMeshtastic
// ('mesh:connected' while a radio is attached, 'mesh:peers' the first time a
// session hears another radio). Same daily-rotating visitor hash as page
// traffic, so mesh numbers carry exactly the same privacy properties — and the
// same NAT undercount.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const now = Date.now()
  const series = hourSeries(now)
  const since7d = new Date(now - 7 * 86_400_000)
  const since24h = series[0]!

  try {
    const rows = await db
      .select({ visitor: usagePulse.visitor, path: usagePulse.path, bucket: usagePulse.bucket })
      .from(usagePulse)
      .where(gte(usagePulse.bucket, since7d))

    const activeCut = now - ACTIVE_WINDOW_MINUTES * 60_000
    const site = {
      activeNow: new Set<string>(),
      day: new Set<string>(),
      week: new Set<string>(),
      byHour: series.map(() => new Set<string>()),
      paths: new Map<string, Set<string>>(),
      activePaths: new Map<string, Set<string>>(),
    }
    const mesh = {
      connectedNow: new Set<string>(),
      day: new Set<string>(),
      week: new Set<string>(),
      heardPeersWeek: new Set<string>(),
    }

    for (const r of rows) {
      const ms = r.bucket.getTime()
      const isNow = ms >= activeCut
      const isDay = ms >= since24h

      if (r.path.startsWith('mesh:')) {
        mesh.week.add(r.visitor)
        if (isDay)
          mesh.day.add(r.visitor)
        if (isNow && r.path === 'mesh:connected')
          mesh.connectedNow.add(r.visitor)
        if (r.path === 'mesh:peers')
          mesh.heardPeersWeek.add(r.visitor)
        continue
      }

      site.week.add(r.visitor)
      if (isDay) {
        site.day.add(r.visitor)
        const slot = hourSlot(ms, series)
        if (slot >= 0)
          site.byHour[slot]!.add(r.visitor)
        if (!site.paths.has(r.path))
          site.paths.set(r.path, new Set())
        site.paths.get(r.path)!.add(r.visitor)
      }
      if (isNow) {
        site.activeNow.add(r.visitor)
        if (!site.activePaths.has(r.path))
          site.activePaths.set(r.path, new Set())
        site.activePaths.get(r.path)!.add(r.visitor)
      }
    }

    const hours = site.byHour.map((s, i) => ({ at: series[i]!, n: s.size }))
    const peak = hours.reduce((a, b) => (b.n > a.n ? b : a), hours[0]!)

    return {
      available: true,
      activeNow: site.activeNow.size,
      last24h: site.day.size,
      last7d: site.week.size,
      hours,
      peak: peak.n > 0 ? peak : null,
      topPaths: [...site.paths.entries()]
        .map(([path, s]) => ({ path, n: s.size }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 8),
      // which pages the people here RIGHT NOW are on
      activePaths: [...site.activePaths.entries()]
        .map(([path, s]) => ({ path, n: s.size }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 6),
      mesh: {
        connectedNow: mesh.connectedNow.size,
        last24h: mesh.day.size,
        last7d: mesh.week.size,
        heardPeers7d: mesh.heardPeersWeek.size,
      },
    }
  }
  catch {
    return { available: false, activeNow: 0, last24h: 0, last7d: 0, hours: [], peak: null, topPaths: [], activePaths: [], mesh: { connectedNow: 0, last24h: 0, last7d: 0, heardPeers7d: 0 } }
  }
})
