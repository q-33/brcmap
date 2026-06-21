import { eq } from 'drizzle-orm'
import { art } from '../../../db/schema'
import { artCallSchema } from '../../../utils/validation'

// Owner-only: set or clear an artwork's open call. Single-method sub-resource
// (kept off /api/art/:id so the typed client doesn't collide with its GET).
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const user = await requireUser(event)
  const { call } = await readValidatedBody(event, artCallSchema.parse)
  const db = useDb()

  const target = await db.query.art.findFirst({ where: eq(art.id, id), columns: { ownerId: true } })
  if (!target)
    throw createError({ statusCode: 404, statusMessage: 'Art not found' })
  if (target.ownerId !== user.id)
    throw createError({ statusCode: 403, statusMessage: 'Not your artwork' })

  const [updated] = await db
    .update(art)
    .set({ call: call || null })
    .where(eq(art.id, id))
    .returning({ id: art.id, call: art.call })
  return updated
})
