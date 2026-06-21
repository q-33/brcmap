import { eq } from 'drizzle-orm'
import { art } from '../../db/schema'

// Public: one artwork with its locations, open call, and contributions.
// Anyone sees published contributions; the owner also sees pending/hidden ones.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const viewer = await getOptionalUser(event)
  const db = useDb()

  const row = await db.query.art.findFirst({
    where: eq(art.id, id),
    with: {
      locations: {
        columns: { addressString: true, gpsLatitude: true, gpsLongitude: true, createdAt: true },
      },
      contributions: {
        columns: { id: true, body: true, language: true, mediaUrl: true, authorName: true, status: true, createdAt: true },
        orderBy: (c, { desc }) => [desc(c.createdAt)],
      },
    },
  })
  if (!row)
    throw createError({ statusCode: 404, statusMessage: 'Art not found' })

  const isOwner = !!viewer && viewer.id === row.ownerId
  // Hidden art is visible only to its owner or an admin.
  if (row.hidden && !isOwner && viewer?.role !== 'admin')
    throw createError({ statusCode: 404, statusMessage: 'Art not found' })
  const contributions = (row.contributions ?? []).filter(c => isOwner || c.status === 'published')

  return { ...row, isOwner, contributions }
})
