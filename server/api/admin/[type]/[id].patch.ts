import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { art, camps } from '../../../db/schema'

// Admin: hide / unhide a camp or artwork (soft moderation). `type` is camps|art.
const TABLES = { camps, art } as const
const bodySchema = z.object({ hidden: z.boolean() })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const type = getRouterParam(event, 'type') as keyof typeof TABLES
  const id = getRouterParam(event, 'id')
  if (!id || !(type in TABLES))
    throw createError({ statusCode: 400, statusMessage: 'Invalid content type' })

  const { hidden } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  const table = TABLES[type]
  const [updated] = await db.update(table).set({ hidden }).where(eq(table.id, id)).returning({ id: table.id, hidden: table.hidden })
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return updated
})
