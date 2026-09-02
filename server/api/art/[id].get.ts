import { eq } from 'drizzle-orm'
import { canManageAnyCamp } from '~~/lib/roles'
import { art } from '../../db/schema'

// Public: one artwork with its locations, open call, and contributions.
// Anyone sees published contributions; the owner also sees pending/hidden ones.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  // Live role (not the session snapshot) so a just-demoted admin can't still
  // read hidden art. Returns null without a DB hit for anonymous viewers.
  const viewer = await getFreshUser(event)
  const db = useDb()

  const row = await db.query.art.findFirst({
    where: eq(art.id, id),
    with: {
      owner: { columns: { id: true, displayName: true, playaName: true } },
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

  // Admins/Org can manage (edit) any artwork, like they can any camp.
  const canManage = isOwner || canManageAnyCamp(viewer?.role)
  const out = { ...row, isOwner, canManage, contributions } as Record<string, unknown>
  // The contact email / legacy url are only for someone who can manage the
  // artwork (its owner, or an admin/Org) — strip for everyone else. (Managers
  // need contactEmail so the edit form doesn't blank it on save.)
  if (!canManage) {
    delete out.contactEmail
    delete out.url
  }
  return out
})
