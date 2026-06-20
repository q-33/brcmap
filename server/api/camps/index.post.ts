import { campSchema } from '../../utils/validation'
import { camps } from '../../db/schema'

// Create a camp owned by the current user. Auth required.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, campSchema.parse)
  const db = useDb()

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
