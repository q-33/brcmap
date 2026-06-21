import { eq } from 'drizzle-orm'
import { reportStatusSchema } from '../../../utils/validation'
import { contentReports } from '../../../db/schema'

// Admin: resolve / dismiss a content report.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const { status } = await readValidatedBody(event, reportStatusSchema.parse)
  const db = useDb()
  const [updated] = await db
    .update(contentReports)
    .set({ status, resolvedById: status === 'open' ? null : admin.id, resolvedAt: status === 'open' ? null : new Date() })
    .where(eq(contentReports.id, id))
    .returning({ id: contentReports.id, status: contentReports.status })
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'Report not found' })

  await audit(admin.id, `report.${status}`, { targetType: 'report', targetId: id })
  return updated
})
