import { eq } from 'drizzle-orm'
import { artContributions } from '../../../db/schema'
import { artContributionModerateSchema } from '../../../utils/validation'

// The artwork's owner OR an admin: publish or hide a submitted contribution.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const user = await requireUser(event)
  const { status } = await readValidatedBody(event, artContributionModerateSchema.parse)
  const db = useDb()

  const row = await db.query.artContributions.findFirst({
    where: eq(artContributions.id, id),
    columns: { id: true },
    with: { art: { columns: { ownerId: true } } },
  })
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Contribution not found' })
  if (row.art?.ownerId !== user.id && user.role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Not your artwork' })

  const [updated] = await db
    .update(artContributions)
    .set({ status })
    .where(eq(artContributions.id, id))
    .returning({ id: artContributions.id, status: artContributions.status })
  await audit(user.id, `contribution.${status}`, { targetType: 'contribution', targetId: id })
  return updated
})
