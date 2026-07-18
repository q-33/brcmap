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
      with: {
        owner: { columns: { email: true, displayName: true } },
        locations: { columns: { gpsLatitude: true, gpsLongitude: true, addressString: true, createdAt: true } },
      },
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
    camps: campRows.map((c) => {
      const loc = [...c.locations].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
      return {
        id: c.id,
        name: c.name,
        year: c.year,
        owner: c.owner?.email ?? null,
        locations: c.locations.length,
        hidden: c.hidden,
        description: c.description,
        website: c.website,
        contactEmail: c.contactEmail,
        hometown: c.hometown,
        frontageFt: c.frontageFt,
        depthFt: c.depthFt,
        lat: loc?.gpsLatitude ?? null,
        lng: loc?.gpsLongitude ?? null,
        address: loc?.addressString ?? null,
      }
    }),
    art: artRows.map(a => ({
      id: a.id,
      name: a.name,
      year: a.year,
      owner: a.owner?.email ?? null,
      locations: a.locations.length,
      contributions: a.contributions.length,
      pending: a.contributions.filter(x => x.status === 'pending').length,
      hidden: a.hidden,
      artist: a.artist,
      description: a.description,
      website: a.website,
      contactEmail: a.contactEmail,
      hometown: a.hometown,
    })),
    events: eventRows.map(e => ({ id: e.id, title: e.title, camp: e.camp?.name ?? null, startsAt: e.startsAt })),
  }
})
