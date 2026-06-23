import { eq } from 'drizzle-orm'
import { campUpdateSchema } from '../../utils/validation'
import { camps } from '../../db/schema'
import { canManageAnyCamp } from '~~/lib/roles'

// Update a camp's details (name, description, website, contact, hometown).
// Owner-only (BM Org + admins may edit any camp). Location/year handled elsewhere.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })
  const body = await readValidatedBody(event, campUpdateSchema.parse)
  const db = useDb()

  const [camp] = await db.select({ ownerId: camps.ownerId }).from(camps).where(eq(camps.id, id)).limit(1)
  if (!camp)
    throw createError({ statusCode: 404, statusMessage: 'Camp not found' })
  if (camp.ownerId !== user.id && !canManageAnyCamp(user.role))
    throw createError({ statusCode: 403, statusMessage: 'You do not own that camp' })

  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined)
    set.name = body.name
  if (body.description !== undefined)
    set.description = body.description || null
  if (body.website !== undefined)
    set.website = body.website || null
  if (body.contactEmail !== undefined)
    set.contactEmail = body.contactEmail || null
  if (body.hometown !== undefined)
    set.hometown = body.hometown || null
  if (body.frontageFt !== undefined)
    set.frontageFt = body.frontageFt || null
  if (body.depthFt !== undefined)
    set.depthFt = body.depthFt || null

  const [updated] = await db.update(camps).set(set).where(eq(camps.id, id)).returning()
  return updated
})
