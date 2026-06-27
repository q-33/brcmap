import { eq } from 'drizzle-orm'
import { artUpdateSchema } from '../../../../utils/validation'
import { art } from '../../../../db/schema'

// Admin: edit an artwork's details (e.g. fixing a name/year/description on a
// piece dropped in error). Hide/show and delete are handled by the generic
// /api/admin/[type]/[id] endpoints; this only touches metadata.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const body = await readValidatedBody(event, artUpdateSchema.parse)
  const db = useDb()

  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined)
    set.name = body.name
  if (body.artist !== undefined)
    set.artist = body.artist || null
  if (body.year !== undefined)
    set.year = body.year
  if (body.description !== undefined)
    set.description = body.description || null
  if (body.website !== undefined)
    set.website = body.website || null
  if (body.contactEmail !== undefined)
    set.contactEmail = body.contactEmail || null
  if (body.hometown !== undefined)
    set.hometown = body.hometown || null

  const [updated] = await db.update(art).set(set).where(eq(art.id, id)).returning()
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'Art not found' })

  await audit(admin.id, 'art.edit', { targetType: 'art', targetId: id })
  return updated
})
