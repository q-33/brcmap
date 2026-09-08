import { broadcastSchema } from '../../utils/validation'
import { renderBroadcastHtml, sendEmail } from '../../utils/email'
import { broadcastRecipients, broadcasts, users } from '../../db/schema'

// Admin: broadcast to every registered user — by ENQUEUEING, not sending.
//
// The old version sent 440 sequential SMTP mails inside this request: it died
// on the platform's request timeout mid-loop, kept no record of where, and a
// retry double-mailed the early recipients; DreamHost's ~100/hour relay cap
// broke whatever survived. Now `all` writes one broadcast + one row per
// recipient and returns immediately; the drip worker
// (server/plugins/broadcast-drip.ts) delivers a few per minute and each row
// remembers its own fate. `self` still sends inline — a test mail should
// arrive while you're looking at the screen.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { subject, body, target } = await readValidatedBody(event, broadcastSchema.parse)
  rateLimit(event, target === 'all' ? 'broadcast-all' : 'broadcast-test', target === 'all' ? 3 : 20, 60 * 60_000, admin.id)

  const db = useDb()
  if (target === 'self') {
    const ok = await sendEmail({ to: admin.email, subject, text: body, html: renderBroadcastHtml(body) })
    return { target, total: 1, sent: ok ? 1 : 0, failed: ok ? 0 : 1, queued: 0 }
  }

  const rows = await db.select({ email: users.email }).from(users)
  const recipients = [...new Set(rows.map(r => r.email).filter(Boolean))]
  if (!recipients.length)
    throw createError({ statusCode: 400, statusMessage: 'No recipients' })

  const [b] = await db.insert(broadcasts).values({ subject, body, createdBy: admin.id }).returning({ id: broadcasts.id })
  await db.insert(broadcastRecipients)
    .values(recipients.map(email => ({ broadcastId: b!.id, email })))
    .onConflictDoNothing()

  await audit(admin.id, 'broadcast', { detail: `queued ${recipients.length} · "${subject.slice(0, 80)}"` })
  return { target, total: recipients.length, sent: 0, failed: 0, queued: recipients.length, broadcastId: b!.id }
})
