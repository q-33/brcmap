import { and, eq } from 'drizzle-orm'
import { rides } from '../../db/schema'
import { rideStatusSchema } from '../../utils/validation'

// Owner: mark the post found/full (closed), or reopen it if plans change.
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const id = getRouterParam(event, 'id')!
  const { status } = await readValidatedBody(event, rideStatusSchema.parse)
  const [row] = await useDb()
    .update(rides)
    .set({ status })
    .where(and(eq(rides.id, id), eq(rides.ownerId, user.id)))
    .returning()
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Not your post, or it does not exist' })
  return row
})
