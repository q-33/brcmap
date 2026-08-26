import { asc } from 'drizzle-orm'
import { weatherStations } from '../../../db/schema'

// Admin: every registered station, with its last known position and reading.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const rows = await useDb().select().from(weatherStations).orderBy(asc(weatherStations.createdAt))
  return rows
})
