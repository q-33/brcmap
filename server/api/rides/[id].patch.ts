import { and, eq, ne } from 'drizzle-orm'
import { rideConnections, rides } from '../../db/schema'
import { rideStatusSchema } from '../../utils/validation'

// Owner: mark the post found/full (closed), or reopen it if plans change.
// Closing also ends every live-location connection on the post, positions
// nulled, the same as pressing "end" on each — a closed ride is not a reason
// for two people to keep broadcasting where they are.
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const id = getRouterParam(event, 'id')!
  const { status } = await readValidatedBody(event, rideStatusSchema.parse)
  const row = await useDb().transaction(async (tx) => {
    const [r] = await tx
      .update(rides)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(rides.id, id), eq(rides.ownerId, user.id)))
      .returning()
    if (r && status === 'closed') {
      await tx.update(rideConnections)
        .set({ status: 'ended', ownerLat: null, ownerLng: null, ownerAt: null, requesterLat: null, requesterLng: null, requesterAt: null })
        .where(and(eq(rideConnections.rideId, id), ne(rideConnections.status, 'ended')))
    }
    return r
  })
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Not your post, or it does not exist' })
  return row
})
