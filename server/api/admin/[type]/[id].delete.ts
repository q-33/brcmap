import { eq } from 'drizzle-orm'
import { art, camps, events } from '../../../db/schema'

// Admin: delete a camp / art / event (cascades its locations, contributions,
// and a camp's events). `type` is one of camps | art | events.
const TABLES = { camps, art, events } as const

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const type = getRouterParam(event, 'type') as keyof typeof TABLES
  const id = getRouterParam(event, 'id')
  if (!id || !(type in TABLES))
    throw createError({ statusCode: 400, statusMessage: 'Invalid content type' })

  const db = useDb()
  const table = TABLES[type]
  const [deleted] = await db.delete(table).where(eq(table.id, id)).returning({ id: table.id })
  if (!deleted)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await audit(admin.id, 'content.delete', { targetType: type, targetId: id })
  return { ok: true, id: deleted.id }
})
