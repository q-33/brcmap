import { eq } from 'drizzle-orm'
import { rideConnections } from '../../../../db/schema'
import { ridePositionSchema } from '../../../../utils/validation'

// One side of an ACTIVE connection reports where it is. Writes only the
// caller's own pair of columns; refuses outright unless the connection is
// active — a pending request must never quietly start collecting fixes.
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const id = getRouterParam(event, 'id')!
  const { lat, lng } = await readValidatedBody(event, ridePositionSchema.parse)
  const db = useDb()

  const conn = await db.query.rideConnections.findFirst({
    where: eq(rideConnections.id, id),
    with: { ride: { columns: { ownerId: true } } },
  })
  if (!conn || (conn.requesterId !== user.id && conn.ride?.ownerId !== user.id))
    throw createError({ statusCode: 404, statusMessage: 'No such connection' })
  if (conn.status !== 'active')
    throw createError({ statusCode: 409, statusMessage: 'Not sharing — the connection is not active' })

  const now = new Date()
  const patch = conn.ride?.ownerId === user.id
    ? { ownerLat: lat, ownerLng: lng, ownerAt: now }
    : { requesterLat: lat, requesterLng: lng, requesterAt: now }
  await db.update(rideConnections).set(patch).where(eq(rideConnections.id, id))
  return { ok: true }
})
