import { eq } from 'drizzle-orm'
import { eventSchema } from '../../utils/validation'
import { camps, events } from '../../db/schema'

// Create an event. Camp owners post under a camp they own; admins may also post
// an "official" event with no camp, or on behalf of any camp. Auth required.
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const body = await readValidatedBody(event, eventSchema.parse)
  const db = useDb()
  const isAdmin = user.role === 'admin'

  let campId: string | null = null
  if (body.campId) {
    const [camp] = await db.select({ ownerId: camps.ownerId }).from(camps).where(eq(camps.id, body.campId)).limit(1)
    if (!camp)
      throw createError({ statusCode: 404, statusMessage: 'Camp not found' })
    if (camp.ownerId !== user.id && !isAdmin)
      throw createError({ statusCode: 403, statusMessage: 'You do not own that camp' })
    campId = body.campId
  }
  else if (!isAdmin) {
    // Non-admins must host their event under a camp they own.
    throw createError({ statusCode: 403, statusMessage: 'Select a camp to host your event' })
  }

  const [created] = await db
    .insert(events)
    .values({
      ownerId: user.id,
      campId,
      title: body.title,
      description: body.description,
      startsAt: body.startsAt,
      endsAt: body.endsAt || null,
    })
    .returning()
  return created
})
