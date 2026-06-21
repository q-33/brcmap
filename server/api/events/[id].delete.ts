import { and, eq } from 'drizzle-orm'
import { events } from '../../db/schema'

// Delete an event you own. Auth required.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing event id' })
  const db = useDb()

  const result = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.ownerId, user.id)))
    .returning({ id: events.id })
  if (!result.length)
    throw createError({ statusCode: 404, statusMessage: 'Event not found or not yours' })
  return { ok: true }
})
