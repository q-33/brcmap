import { desc } from 'drizzle-orm'
import { rides } from '../../db/schema'

// Public: the open rideshare board, newest first. A logged-in viewer also gets
// their own closed posts back (so "mark as found" doesn't make a post vanish
// from under its owner), flagged with `mine` so the page can group them.
export default defineEventHandler(async (event) => {
  const viewer = await getFreshUser(event)
  const db = useDb()
  const rows = await db.query.rides.findMany({
    orderBy: [desc(rides.createdAt)],
    limit: 400,
    with: { owner: { columns: { id: true, displayName: true, playaName: true } } },
  })
  return rows
    .filter(r => r.status === 'open' || r.ownerId === viewer?.id)
    .map(r => ({ ...r, mine: r.ownerId === viewer?.id }))
})
