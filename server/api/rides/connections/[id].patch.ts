import { eq } from 'drizzle-orm'
import { rideConnections } from '../../../db/schema'
import { rideConnectionStatusSchema } from '../../../utils/validation'

// Accept (owner only, pending only) or end (either side, any time).
// Ending NULLS both positions in the same statement — the moment consent is
// withdrawn, the last fix is gone, not merely hidden.
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const id = getRouterParam(event, 'id')!
  const { status } = await readValidatedBody(event, rideConnectionStatusSchema.parse)
  const db = useDb()

  const conn = await db.query.rideConnections.findFirst({
    where: eq(rideConnections.id, id),
    with: { ride: { columns: { ownerId: true } } },
  })
  if (!conn)
    throw createError({ statusCode: 404, statusMessage: 'No such connection' })
  const iAmOwner = conn.ride?.ownerId === user.id
  const iAmRequester = conn.requesterId === user.id
  if (!iAmOwner && !iAmRequester)
    throw createError({ statusCode: 404, statusMessage: 'No such connection' })

  if (status === 'active') {
    if (!iAmOwner)
      throw createError({ statusCode: 403, statusMessage: 'Only the post owner accepts a connection' })
    if (conn.status !== 'pending')
      throw createError({ statusCode: 409, statusMessage: 'Not awaiting acceptance' })
    const [row] = await db.update(rideConnections).set({ status: 'active' })
      .where(eq(rideConnections.id, id)).returning()
    return row
  }
  const [row] = await db.update(rideConnections).set({
    status: 'ended',
    ownerLat: null, ownerLng: null, ownerAt: null,
    requesterLat: null, requesterLng: null, requesterAt: null,
  }).where(eq(rideConnections.id, id)).returning()
  return row
})
