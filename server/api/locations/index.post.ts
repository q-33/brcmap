import { and, eq } from 'drizzle-orm'
import { locationSchema } from '../../utils/validation'
import { art, camps, locations } from '../../db/schema'
import { addressToLatLng, parseAddress } from '~~/lib/brc/geocode'

// Mark a location for a camp/art the user owns. The BRC address is geocoded to
// lat/lng server-side so coordinates are authoritative and consistent.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, locationSchema.parse)
  const db = useDb()

  // Verify the user owns the parent camp/art.
  if (body.campId) {
    const [c] = await db.select({ ownerId: camps.ownerId }).from(camps).where(eq(camps.id, body.campId)).limit(1)
    if (!c)
      throw createError({ statusCode: 404, statusMessage: 'Camp not found' })
    if (c.ownerId !== user.id)
      throw createError({ statusCode: 403, statusMessage: 'You do not own that camp' })
  }
  else if (body.artId) {
    const [a] = await db.select({ ownerId: art.ownerId }).from(art).where(eq(art.id, body.artId)).limit(1)
    if (!a)
      throw createError({ statusCode: 404, statusMessage: 'Art not found' })
    if (a.ownerId !== user.id)
      throw createError({ statusCode: 403, statusMessage: 'You do not own that art' })
  }

  const parsed = parseAddress(body.addressString)
  const gps = parsed ? addressToLatLng(parsed) : null

  // Replace any existing location for this parent (one current location per camp/art).
  if (body.campId)
    await db.delete(locations).where(and(eq(locations.campId, body.campId)))
  else if (body.artId)
    await db.delete(locations).where(and(eq(locations.artId, body.artId)))

  const [loc] = await db
    .insert(locations)
    .values({
      ownerId: user.id,
      campId: body.campId ?? null,
      artId: body.artId ?? null,
      addressString: body.addressString,
      hour: parsed ? Math.floor(parsed.time) : null,
      minute: parsed ? Math.round((parsed.time % 1) * 60) : null,
      roadLetter: parsed?.street ?? null,
      gpsLatitude: gps?.lat ?? null,
      gpsLongitude: gps?.lng ?? null,
    })
    .returning()
  return loc
})
