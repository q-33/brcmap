import { artSchema } from '../../utils/validation'
import { art } from '../../db/schema'

// Create an art installation owned by the current user. Auth required.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, artSchema.parse)
  const db = useDb()

  const [created] = await db
    .insert(art)
    .values({
      ownerId: user.id,
      name: body.name,
      year: body.year,
      description: body.description,
      website: body.website || null,
      contactEmail: body.contactEmail || null,
      hometown: body.hometown,
      call: body.call || null,
    })
    .returning()
  return created
})
