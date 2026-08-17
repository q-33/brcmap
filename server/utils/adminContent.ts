import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { art, camps, events as eventsTable } from '../db/schema'

// Shared admin moderation actions for camps / art / events.
//
// These live in a util rather than only in server/api/admin/[type]/[id].* because
// that catch-all does NOT match every type. A literal directory beside it wins the
// route: once server/api/admin/camps/ existed (added for the assign-owner tool),
// /api/admin/camps/<id> stopped resolving to [type] and started 404ing, silently
// breaking camp delete and hide. The camps routes now import these instead of
// re-implementing them, so the two paths cannot drift apart.
const DELETE_TABLES = { camps, art, events: eventsTable } as const
const HIDE_TABLES = { camps, art } as const

export const hiddenSchema = z.object({ hidden: z.boolean() })

/** Delete a camp / artwork / event. Cascades locations, contributions and a camp's events. */
export async function adminDeleteContent(
  event: H3Event,
  type: keyof typeof DELETE_TABLES,
  id: string | undefined,
): Promise<{ ok: true, id: string }> {
  const admin = await requireAdmin(event)
  if (!id || !(type in DELETE_TABLES))
    throw createError({ statusCode: 400, statusMessage: 'Invalid content type' })

  const table = DELETE_TABLES[type]
  const [deleted] = await useDb().delete(table).where(eq(table.id, id)).returning({ id: table.id })
  if (!deleted)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await audit(admin.id, 'content.delete', { targetType: type, targetId: id })
  return { ok: true, id: deleted.id }
}

/** Hide / unhide a camp or artwork (soft moderation). */
export async function adminSetHidden(
  event: H3Event,
  type: keyof typeof HIDE_TABLES,
  id: string | undefined,
  hidden: boolean,
): Promise<{ id: string, hidden: boolean }> {
  const admin = await requireAdmin(event)
  if (!id || !(type in HIDE_TABLES))
    throw createError({ statusCode: 400, statusMessage: 'Invalid content type' })

  const table = HIDE_TABLES[type]
  const [updated] = await useDb().update(table).set({ hidden }).where(eq(table.id, id))
    .returning({ id: table.id, hidden: table.hidden })
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  await audit(admin.id, hidden ? 'content.hide' : 'content.show', { targetType: type, targetId: id })
  return updated
}
