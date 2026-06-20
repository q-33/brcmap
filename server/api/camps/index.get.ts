import { desc } from 'drizzle-orm'
import { camps, locations } from '../../db/schema'

// Public: all camps with their locations. Read-only, no auth.
export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db.query.camps.findMany({
    orderBy: [desc(camps.createdAt)],
    with: {
      locations: {
        columns: { addressString: true, gpsLatitude: true, gpsLongitude: true, createdAt: true },
      },
    },
  })
  return rows
})
