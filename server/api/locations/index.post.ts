import { and, eq } from 'drizzle-orm'
import { locationSchema } from '../../utils/validation'
import { art, camps, locations } from '../../db/schema'
import { addressToLatLng, formatAddress, latLngToAddress, parseAddress } from '~~/lib/brc/geocode'

// Mark a location for a camp/art the user owns. A tapped map point (lat/lng) is
// stored EXACTLY where placed — the address is only a derived label. A typed BRC
// address is geocoded to the grid (intentionally snapped to an intersection).
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

  // Resolve the point + a label. A map tap keeps its EXACT coordinates; a typed
  // address is geocoded (snapped) to the grid.
  let lat: number | null
  let lng: number | null
  let addr: { time: number, street: string }
  let addressString: string
  if (body.lat != null && body.lng != null) {
    lat = body.lat
    lng = body.lng
    addr = latLngToAddress({ lat, lng }) // nearest address, for the label/search only
    addressString = formatAddress(addr)
  }
  else {
    const parsed = parseAddress(body.addressString!)
    const gps = parsed ? addressToLatLng(parsed) : null
    lat = gps?.lat ?? null
    lng = gps?.lng ?? null
    addr = parsed ?? { time: 0, street: '' }
    addressString = body.addressString!
  }

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
      addressString,
      hour: addr.street ? Math.floor(addr.time) : null,
      minute: addr.street ? Math.round((addr.time % 1) * 60) : null,
      roadLetter: addr.street || null,
      gpsLatitude: lat,
      gpsLongitude: lng,
    })
    .returning()
  return loc
})
