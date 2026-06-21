import { eq } from 'drizzle-orm'
import { roleSchema } from '../../../utils/validation'
import { users } from '../../../db/schema'

// Admin: set a user's role. You can't change your own role (avoids self-lockout).
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  if (id === admin.id)
    throw createError({ statusCode: 400, statusMessage: 'You can’t change your own role' })

  const { role } = await readValidatedBody(event, roleSchema.parse)
  const db = useDb()
  const [updated] = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, role: users.role })
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'User not found' })
  await audit(admin.id, 'role.set', { targetType: 'user', targetId: id, detail: role })
  return updated
})
