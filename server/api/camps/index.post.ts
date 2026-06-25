import { eq } from 'drizzle-orm'
import { campSchema } from '../../utils/validation'
import { camps } from '../../db/schema'

// Create a camp owned by the current user. Any signed-in user may create one
// (one camp per user — edit the existing one instead of creating another).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, campSchema.parse)
  const db = useDb()

  const [existing] = await db.select({ id: camps.id }).from(camps).where(eq(camps.ownerId, user.id)).limit(1)
  if (existing)
    throw createError({ statusCode: 409, statusMessage: 'You already have a camp — edit it instead.' })

  const [camp] = await db
    .insert(camps)
    .values({
      ownerId: user.id,
      name: body.name,
      year: body.year,
      description: body.description,
      website: body.website || null,
      contactEmail: body.contactEmail || null,
      hometown: body.hometown,
    })
    .returning()
  return camp
})
