import { desc } from 'drizzle-orm'
import { gateConditions } from '../../db/schema'

// Public: current Gate Road conditions (newest per direction) + recent history.
export default defineEventHandler(async () => {
  const db = useDb()
  const rows = await db.query.gateConditions.findMany({
    orderBy: [desc(gateConditions.createdAt)],
    limit: 40,
    with: { updatedBy: { columns: { displayName: true } } },
  })
  const latest = (dir: 'inbound' | 'exodus') => rows.find(r => r.direction === dir) ?? null
  return {
    inbound: latest('inbound'),
    exodus: latest('exodus'),
    history: rows.slice(0, 20),
  }
})
