import { and, asc, eq, lt } from 'drizzle-orm'
import { renderBroadcastHtml, sendEmail, smtpAttemptsLastHour } from '../utils/email'
import { broadcastRecipients, broadcasts } from '../db/schema'

// The drip: every minute, deliver a few queued broadcast emails — inside
// DreamHost's real quota, verified from their published policy:
//
//   · 100 RECIPIENTS PER HOUR, counted individually, ATTEMPTS included
//   · exceed it and the mailbox is blocked until a FULL HOUR passes with no
//     further attempts — and repeat offenders are blocked permanently
//
// Three guardrails follow directly from those rules:
//
//   1. PACE — default one send a minute (60/hr), env-tunable but clamped so
//      no configuration can reach the cap on its own.
//   2. SHARED BUDGET — the drip checks the hour's TOTAL relay attempts
//      (password resets, contact mail and nudges share this mailbox) and
//      stands down at 85/hr, leaving real headroom under 100.
//   3. CIRCUIT BREAKER — if an entire batch fails, that's the relay refusing
//      us (quota, auth, outage), not bad addresses: the rows keep their
//      attempts (nobody gets parked over an outage) and the drip goes SILENT
//      for 65 minutes — because under a quota block, retrying every minute is
//      exactly the behaviour that makes the block permanent.
//
// One instance runs this app, so plain module state is honest machinery. A
// restart forgets the pause — and immediately re-trips it on the next full
// batch failure, which is the safe direction to be wrong in.
const HOURLY_BUDGET = 85
const BREAKER_MS = 65 * 60_000

export default defineNitroPlugin(() => {
  const perMinute = Math.max(1, Math.min(5, Number(process.env.BROADCAST_PER_MINUTE ?? 1)))
  let draining = false
  let pausedUntil = 0

  setInterval(async () => {
    if (draining || Date.now() < pausedUntil)
      return
    draining = true
    try {
      if (smtpAttemptsLastHour() >= HOURLY_BUDGET)
        return // the mailbox is busy enough this hour; the queue can wait

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

      const failures: typeof batch = []
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
          failures.push(r)
        }
      }

      if (failures.length && failures.length === batch.length) {
        // The relay said no to everything: systemic, not the addresses' fault.
        // Attempts stay untouched and the drip goes quiet for the quiet hour
        // DreamHost's unblock requires (plus margin).
        pausedUntil = Date.now() + BREAKER_MS
        console.warn(`[broadcast-drip] whole batch of ${batch.length} failed — pausing sends for 65 min (quota block protection)`)
        return
      }
      for (const r of failures) {
        // Partial failure: the relay works, this address doesn't. Count it.
        await db.update(broadcastRecipients)
          .set({
            attempts: r.attempts + 1,
            status: r.attempts + 1 >= 3 ? 'failed' : 'queued',
            lastError: 'sendMail returned false (see server logs)',
          })
          .where(eq(broadcastRecipients.id, r.id))
      }
    }
    catch {
      // DB asleep or table missing pre-migration — try again next minute
    }
    finally {
      draining = false
    }
  }, 60_000)
})
