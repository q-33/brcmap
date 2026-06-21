import { desc } from 'drizzle-orm'
import { auditLog } from '../../db/schema'

// Admin: the moderation audit log (most recent first).
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const rows = await db.query.auditLog.findMany({
    orderBy: [desc(auditLog.createdAt)],
    limit: 100,
    with: { actor: { columns: { email: true, displayName: true } } },
  })
  return rows.map(r => ({
    id: r.id,
    action: r.action,
    actor: r.actor?.email ?? '(system)',
    targetType: r.targetType,
    targetId: r.targetId,
    detail: r.detail,
    createdAt: r.createdAt,
  }))
})
