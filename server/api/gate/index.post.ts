import { gateConditionSchema } from '../../utils/validation'
import { gateConditions } from '../../db/schema'

// GPE/admin only: post a new Gate Road condition for one direction.
export default defineEventHandler(async (event) => {
  const user = await requireGpe(event)
  const body = await readValidatedBody(event, gateConditionSchema.parse)
  const db = useDb()

  const [row] = await db
    .insert(gateConditions)
    .values({
      direction: body.direction,
      status: body.status,
      waitLabel: body.waitLabel || null,
      note: body.note || null,
      updatedById: user.id,
    })
    .returning()
  return row
})
