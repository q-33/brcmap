import { desc } from 'drizzle-orm'
import { art, camps, events } from '../../db/schema'

// Admin: all camps, art, and events with owner + counts, for moderation.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()

  const [campRows, artRows, eventRows] = await Promise.all([
    db.query.camps.findMany({
      orderBy: [desc(camps.createdAt)],
      limit: 500,
      with: { owner: { columns: { email: true, displayName: true } }, locations: { columns: { id: true } } },
    }),
    db.query.art.findMany({
      orderBy: [desc(art.createdAt)],
      limit: 500,
      with: {
        owner: { columns: { email: true, displayName: true } },
        locations: { columns: { id: true } },
        contributions: { columns: { id: true, status: true } },
      },
    }),
    db.query.events.findMany({
      orderBy: [desc(events.createdAt)],
      limit: 500,
      with: { camp: { columns: { name: true } } },
    }),
  ])

  return {
    camps: campRows.map(c => ({ id: c.id, name: c.name, year: c.year, owner: c.owner?.email ?? null, locations: c.locations.length, hidden: c.hidden })),
    art: artRows.map(a => ({
      id: a.id,
      name: a.name,
      year: a.year,
      owner: a.owner?.email ?? null,
      locations: a.locations.length,
      contributions: a.contributions.length,
      pending: a.contributions.filter(x => x.status === 'pending').length,
      hidden: a.hidden,
    })),
    events: eventRows.map(e => ({ id: e.id, title: e.title, camp: e.camp?.name ?? null, startsAt: e.startsAt })),
  }
})
