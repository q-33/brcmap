import { rides } from '../../db/schema'
import { rideCreateSchema } from '../../utils/validation'

// Logged-in: post an offer or a request. Login required because the whole
// point is connecting through in-app messages, and messages need an account.
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Log in to post a ride' })
  const body = await readValidatedBody(event, rideCreateSchema.parse)
  const [row] = await useDb().insert(rides).values({
    ownerId: user.id,
    kind: body.kind,
    destination: body.destination,
    departs: body.departs || null,
    seats: body.kind === 'offer' ? body.seats ?? null : null,
    luggage: body.kind === 'request' ? body.luggage || null : null,
    fromLocation: body.fromLocation || null,
    note: body.note || null,
  }).returning()
  return row
})
