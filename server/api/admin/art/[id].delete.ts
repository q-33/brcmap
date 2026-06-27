import { eq } from 'drizzle-orm'
import { art } from '../../../db/schema'

// Admin: delete an artwork (cascades its contributions, claims, and location
// pins). Lives here rather than under the generic /api/admin/[type]/[id]
// because the art/[id]/ subfolder (details, to-camp) shadows that param route.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const db = useDb()
  const [deleted] = await db.delete(art).where(eq(art.id, id)).returning({ id: art.id })
  if (!deleted)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await audit(admin.id, 'content.delete', { targetType: 'art', targetId: id })
  return { ok: true, id: deleted.id }
})
