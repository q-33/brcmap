import { eq } from 'drizzle-orm'
import { weatherStations } from '../../../db/schema'

// Admin: remove a station. ?id=<uuid>
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = String(getQuery(event).id ?? '')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const [gone] = await useDb().delete(weatherStations).where(eq(weatherStations.id, id))
    .returning({ id: weatherStations.id, stationId: weatherStations.stationId })
  if (!gone)
    throw createError({ statusCode: 404, statusMessage: 'No such station' })
  await audit(admin.id, 'weather-station.remove', { targetType: 'weather_station', targetId: id, detail: gone.stationId })
  return { ok: true }
})
