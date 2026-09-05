import { and, eq } from 'drizzle-orm'
import { rideConnections, rides } from '../../../db/schema'

// Ask to connect on a ride post. Creates a PENDING connection — nothing is
// shared until the post's owner accepts. Asking again after an ended
// connection re-opens the request rather than erroring: plans change.
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Log in to connect' })
  const id = getRouterParam(event, 'id')!
  const db = useDb()

  const ride = await db.query.rides.findFirst({ where: eq(rides.id, id) })
  if (!ride || ride.status !== 'open')
    throw createError({ statusCode: 404, statusMessage: 'That post is gone or closed' })
  if (ride.ownerId === user.id)
    throw createError({ statusCode: 400, statusMessage: 'That is your own post' })

  const existing = await db.query.rideConnections.findFirst({
    where: and(eq(rideConnections.rideId, id), eq(rideConnections.requesterId, user.id)),
  })
  if (existing) {
    if (existing.status !== 'ended')
      return existing
    // re-request: back to pending, and make very sure no old fix survives
    const [row] = await db.update(rideConnections).set({
      status: 'pending',
      ownerLat: null, ownerLng: null, ownerAt: null,
      requesterLat: null, requesterLng: null, requesterAt: null,
    }).where(eq(rideConnections.id, existing.id)).returning()
    return row
  }
  const [row] = await db.insert(rideConnections)
    .values({ rideId: id, requesterId: user.id })
    .returning()
  return row
})
