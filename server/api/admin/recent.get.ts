import { desc } from 'drizzle-orm'
import { art, artContributions, camps, events } from '../../db/schema'

// Admin: a reverse-chronological feed of newly created content across types.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()

  const [campRows, artRows, eventRows, contribRows] = await Promise.all([
    db.query.camps.findMany({ columns: { id: true, name: true, createdAt: true }, orderBy: [desc(camps.createdAt)], limit: 25 }),
    db.query.art.findMany({ columns: { id: true, name: true, createdAt: true }, orderBy: [desc(art.createdAt)], limit: 25 }),
    db.query.events.findMany({ columns: { id: true, title: true, createdAt: true }, orderBy: [desc(events.createdAt)], limit: 25 }),
    db.query.artContributions.findMany({ columns: { id: true, body: true, createdAt: true }, orderBy: [desc(artContributions.createdAt)], limit: 25 }),
  ])

  const feed = [
    ...campRows.map(c => ({ type: 'camp', id: c.id, label: c.name, createdAt: c.createdAt })),
    ...artRows.map(a => ({ type: 'art', id: a.id, label: a.name, createdAt: a.createdAt })),
    ...eventRows.map(e => ({ type: 'event', id: e.id, label: e.title, createdAt: e.createdAt })),
    ...contribRows.map(c => ({ type: 'contribution', id: c.id, label: c.body.slice(0, 60), createdAt: c.createdAt })),
  ]
  feed.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
  return feed.slice(0, 40)
})
