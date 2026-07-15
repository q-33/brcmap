import { eq, ilike } from 'drizzle-orm'
import { z } from 'zod'
import { camps, users } from '../../../../db/schema'

// Admin: (re)assign a camp's owner by the owner's account email. Lets an organizer
// manage a camp that's already on the map (e.g. seeded / created by someone else) —
// once they own it they can post events and edit it. Auth: admin only.
const bodySchema = z.object({ email: z.string().trim().email() })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing camp id' })

  const { email } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(ilike(users.email, email)).limit(1)
  if (!u)
    throw createError({ statusCode: 404, statusMessage: `No account found for ${email}` })

  const [updated] = await db.update(camps).set({ ownerId: u.id }).where(eq(camps.id, id)).returning({ id: camps.id, name: camps.name })
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'Camp not found' })

  await audit(admin.id, 'camp.assign_owner', { targetType: 'camps', targetId: id, detail: u.email })
  return { id: updated.id, name: updated.name, ownerEmail: u.email }
})
