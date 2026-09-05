import { and, eq } from 'drizzle-orm'
import { rides } from '../../db/schema'

// Owner deletes their own post; admins can remove anything (moderation).
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const id = getRouterParam(event, 'id')!
  const where = user.role === 'admin'
    ? eq(rides.id, id)
    : and(eq(rides.id, id), eq(rides.ownerId, user.id))
  const [row] = await useDb().delete(rides).where(where).returning({ id: rides.id })
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Not your post, or it does not exist' })
  return { ok: true }
})
