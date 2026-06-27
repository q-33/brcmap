import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { art } from '../../../db/schema'

// Admin: hide / unhide an artwork (soft moderation). Lives here rather than
// under the generic /api/admin/[type]/[id] because the art/[id]/ subfolder
// (details, to-camp) shadows that param route.
const bodySchema = z.object({ hidden: z.boolean() })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const { hidden } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const [updated] = await db.update(art).set({ hidden }).where(eq(art.id, id)).returning({ id: art.id, hidden: art.hidden })
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await audit(admin.id, hidden ? 'content.hide' : 'content.show', { targetType: 'art', targetId: id })
  return updated
})
