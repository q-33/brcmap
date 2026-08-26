import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { weatherStations } from '../../../db/schema'
import { MAX_STATION_KM, kmFromCity } from '~~/lib/weather/stations'

// Admin: register a local weather station by the vendor's own id.
//
// The id is PROBED before anything is stored. A typo, a station that has never
// reported, or one sitting in another state is rejected here with a reason —
// far better than adding a row that silently never appears on the map and
// leaving someone to wonder why.
//
// Position is taken from the vendor's reply, never from the form. What decides
// whether a station is trusted is where it actually is.
const bodySchema = z.object({
  vendor: z.enum(['wunderground', 'tempest']),
  stationId: z.string().trim().min(1).max(40),
  label: z.string().trim().max(80).optional(),
  owner: z.string().trim().max(80).optional(),
  note: z.string().trim().max(300).optional(),
  activeFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  activeTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** add it even if it is currently far from the city (it may be in transit) */
  allowFarAway: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const existing = await db.select({ id: weatherStations.id }).from(weatherStations)
    .where(and(eq(weatherStations.vendor, body.vendor), eq(weatherStations.stationId, body.stationId)))
    .limit(1)
  if (existing.length)
    throw createError({ statusCode: 409, statusMessage: 'That station is already registered.' })

  if (body.vendor !== 'wunderground')
    throw createError({ statusCode: 400, statusMessage: 'Only Weather Underground stations can be added here for now.' })
  if (!wuConfigured())
    throw createError({ statusCode: 503, statusMessage: 'No Weather Underground key configured yet (set WU_API_KEY).' })

  const probe = await wuProbe(body.stationId)
  if (!probe.ok)
    throw createError({ statusCode: 400, statusMessage: probe.reason })

  const km = kmFromCity(probe.obs.lat!, probe.obs.lng!)
  if (km > MAX_STATION_KM && !body.allowFarAway) {
    throw createError({
      statusCode: 400,
      statusMessage: `That station is ${Math.round(km)} km from Black Rock City. Add it anyway only if it is on its way — its readings stay hidden until it arrives.`,
    })
  }

  const [row] = await db.insert(weatherStations).values({
    vendor: body.vendor,
    stationId: body.stationId,
    label: body.label || probe.obs.neighborhood || body.stationId,
    owner: body.owner || null,
    note: body.note || null,
    activeFrom: body.activeFrom || null,
    activeTo: body.activeTo || null,
    lat: probe.obs.lat,
    lng: probe.obs.lng,
    lastSeenAt: new Date(probe.obs.observedAt),
    addedById: admin.id,
  }).returning()

  await audit(admin.id, 'weather-station.add', {
    targetType: 'weather_station',
    targetId: row!.id,
    detail: `${body.vendor}:${body.stationId} · ${Math.round(km)} km from the city`,
  })
  return { ...row, km: Math.round(km), reading: probe.obs }
})
