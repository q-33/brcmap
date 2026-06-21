import { reportSchema } from '../../utils/validation'
import { contentReports } from '../../db/schema'

// A logged-in user flags a camp or artwork for moderator review.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readValidatedBody(event, reportSchema.parse)
  const db = useDb()

  const [row] = await db
    .insert(contentReports)
    .values({
      contentType: body.contentType,
      contentId: body.contentId,
      reporterId: user.id,
      reason: body.reason || null,
    })
    .returning({ id: contentReports.id })
  return { ok: true, id: row?.id }
})
