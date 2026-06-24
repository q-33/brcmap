import { and, desc, eq } from 'drizzle-orm'
import { art, artClaims } from '../../db/schema'

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

  // The viewer's own latest claim on this (ownerless) artwork, so the page can
  // show "claim pending / not approved" and gate the Claim button.
  let myClaim: { status: string } | null = null
  if (viewer && !row.ownerId) {
    const c = await db.query.artClaims.findFirst({
      where: and(eq(artClaims.artId, id), eq(artClaims.claimantId, viewer.id)),
      orderBy: [desc(artClaims.createdAt)],
      columns: { status: true },
    })
    myClaim = c ? { status: c.status } : null
  }

  const out = { ...row, isOwner, contributions, myClaim } as Record<string, unknown>
  // Only the owner needs the contact email / legacy url; strip for everyone else.
  if (!isOwner) {
    delete out.contactEmail
    delete out.url
  }
  return out
})
