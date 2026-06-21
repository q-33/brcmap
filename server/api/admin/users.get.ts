import { desc } from 'drizzle-orm'
import { userFeatures, users } from '../../db/schema'

// Admin: list all users with their roles + granted feature flags.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()

  const [rows, feats] = await Promise.all([
    db.query.users.findMany({
      columns: { id: true, email: true, displayName: true, role: true, createdAt: true },
      orderBy: [desc(users.createdAt)],
      limit: 500,
    }),
    db.select({ userId: userFeatures.userId, feature: userFeatures.feature }).from(userFeatures),
  ])

  const byUser = new Map<string, string[]>()
  for (const f of feats)
    byUser.set(f.userId, [...(byUser.get(f.userId) ?? []), f.feature])

  return rows.map(u => ({ ...u, features: byUser.get(u.id) ?? [] }))
})
