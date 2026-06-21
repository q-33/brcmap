import { eq } from 'drizzle-orm'
import { art, artContributions } from '../../../db/schema'
import { artContributionSchema } from '../../../utils/validation'

// Submit a contribution to an artwork's open call. Logged-in users only.
// Lands as 'pending' until the artwork's owner approves it.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const user = await requireUser(event)
  const body = await readValidatedBody(event, artContributionSchema.parse)
  const db = useDb()

  const target = await db.query.art.findFirst({ where: eq(art.id, id), columns: { id: true } })
  if (!target)
    throw createError({ statusCode: 404, statusMessage: 'Art not found' })

  const [created] = await db
    .insert(artContributions)
    .values({
      artId: id,
      contributorId: user.id,
      authorName: user.displayName ?? null,
      body: body.body,
      language: body.language || null,
      mediaUrl: body.mediaUrl || null,
      // status defaults to 'pending'
    })
    .returning({ id: artContributions.id, status: artContributions.status })
  return created
})
