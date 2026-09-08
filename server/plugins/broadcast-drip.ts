import { and, asc, eq, lt, sql as dsql } from 'drizzle-orm'
import { renderBroadcastHtml, sendEmail } from '../utils/email'
import { broadcastRecipients, broadcasts } from '../db/schema'

// The drip: every minute, deliver a few queued broadcast emails.
//
// The pace exists because of DreamHost's relay cap (~100 recipients/hour on
// shared SMTP). The default — one a minute, 60/hour — clears 440 users in
// about 7½ hours while staying far enough under the cap that password resets
// and contact mail keep flowing through the same mailbox. Raise it with
// BROADCAST_PER_MINUTE once on a relay that allows more.
//
// One instance runs this app, so a plain interval is honest machinery: no
// distributed locking theatre. If the process restarts mid-broadcast, the
// queue is the state — rows already `sent` stay sent, and nobody gets mailed
// twice. A row failing three times is parked as `failed` with its error kept,
// so one dead address can never wedge the queue.
export default defineNitroPlugin(() => {
  const perMinute = Math.max(1, Math.min(20, Number(process.env.BROADCAST_PER_MINUTE ?? 1)))
  let draining = false

  setInterval(async () => {
    if (draining)
      return // a slow SMTP round must not stack a second one on top
    draining = true
    try {
      const db = useDb()
      const batch = await db
        .select({
          id: broadcastRecipients.id,
          email: broadcastRecipients.email,
          attempts: broadcastRecipients.attempts,
          broadcastId: broadcastRecipients.broadcastId,
        })
        .from(broadcastRecipients)
        .where(and(eq(broadcastRecipients.status, 'queued'), lt(broadcastRecipients.attempts, 3)))
        .orderBy(asc(broadcastRecipients.attempts), asc(broadcastRecipients.createdAt))
        .limit(perMinute)
      if (!batch.length)
        return

      for (const r of batch) {
        const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, r.broadcastId))
        if (!b) {
          await db.delete(broadcastRecipients).where(eq(broadcastRecipients.id, r.id))
          continue
        }
        const ok = await sendEmail({ to: r.email, subject: b.subject, text: b.body, html: renderBroadcastHtml(b.body) })
        if (ok) {
          await db.update(broadcastRecipients)
            .set({ status: 'sent', sentAt: new Date(), attempts: r.attempts + 1 })
            .where(eq(broadcastRecipients.id, r.id))
        }
        else {
          await db.update(broadcastRecipients)
            .set({
              attempts: r.attempts + 1,
              status: r.attempts + 1 >= 3 ? 'failed' : 'queued',
              lastError: 'sendMail returned false (see server logs)',
            })
            .where(eq(broadcastRecipients.id, r.id))
        }
      }
      // park anything that ran out of attempts while we weren't looking
      await db.update(broadcastRecipients)
        .set({ status: 'failed' })
        .where(and(eq(broadcastRecipients.status, 'queued'), dsql`attempts >= 3`))
    }
    catch {
      // DB asleep or table missing pre-migration — try again next minute
    }
    finally {
      draining = false
    }
  }, 60_000)
})
