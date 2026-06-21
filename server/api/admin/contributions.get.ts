import { desc, eq } from 'drizzle-orm'
import { artContributions } from '../../db/schema'

// Admin: every pending art contribution across all artworks — the review queue.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const db = useDb()
  const rows = await db.query.artContributions.findMany({
    where: eq(artContributions.status, 'pending'),
    orderBy: [desc(artContributions.createdAt)],
    limit: 200,
    with: { art: { columns: { id: true, name: true } } },
  })
  return rows.map(r => ({
    id: r.id,
    body: r.body,
    language: r.language,
    mediaUrl: r.mediaUrl,
    authorName: r.authorName,
    createdAt: r.createdAt,
    artId: r.art?.id ?? null,
    artName: r.art?.name ?? '(deleted)',
  }))
})
