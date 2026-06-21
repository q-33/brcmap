import { eq } from 'drizzle-orm'
import { eventSchema } from '../../utils/validation'
import { camps, events } from '../../db/schema'

// Create an event for a camp the current user owns. Auth required.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, eventSchema.parse)
  const db = useDb()

  const [camp] = await db.select({ ownerId: camps.ownerId }).from(camps).where(eq(camps.id, body.campId)).limit(1)
  if (!camp)
    throw createError({ statusCode: 404, statusMessage: 'Camp not found' })
  if (camp.ownerId !== user.id)
    throw createError({ statusCode: 403, statusMessage: 'You do not own that camp' })

  const [created] = await db
    .insert(events)
    .values({
      ownerId: user.id,
      campId: body.campId,
      title: body.title,
      description: body.description,
      startsAt: body.startsAt,
      endsAt: body.endsAt || null,
    })
    .returning()
  return created
})
