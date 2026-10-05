import { and, eq, lt, ne, sql } from 'drizzle-orm'
import {
  auditLog, broadcastRecipients, exodusReports, messages, moopReports,
  passwordResetTokens, rideConnections, rides, usagePulse,
} from '../db/schema'

// How long each kind of row lives. The site's promise is "counters that can't
// identify anyone" and "positions are the present only"; before 2026-10 nothing
// in the database was ever deleted, so none of that was enforced by anything
// but good intentions. These are the rules the hourly sweep applies.
//
// Each number is a decision, recorded here so the next person can argue with it.
// (Raw-SQL comparisons below cast the cutoff to timestamptz explicitly: an
// untyped Date parameter next to coalesce()/greatest() fails to type-infer.)
export const RETENTION = {
  /** Raw pulse rows. Admin reads 7 days; keep one spare. Keys rotate daily anyway. */
  pulseDays: 8,
  /** Gate Road wait reports. The page reads 3 hours; two weeks covers the whole Exodus. */
  exodusDays: 14,
  /** Cleaned MOOP pins. The map stops showing them after CLEANED_LINGER_MS; keep a month for Resto. */
  moopCleanedDays: 30,
  /** Expired password-reset hashes. A day past expiry is already generous. */
  resetTokenGraceDays: 1,
  /** Sent/failed broadcast rows: copies of every email address. A month to answer "did you get it?". */
  broadcastRecipientDays: 30,
  /** A live-location share nobody has touched for this long is over. Positions are nulled. */
  connectionIdleHours: 6,
  /** A connection request never accepted. */
  connectionPendingDays: 7,
  /** An open ride post nobody has edited for this long is stale (last year's taillights). */
  rideOpenDays: 45,
  /** Direct messages: Kenneth's call, 2026-10-05 — purge a year after the season. */
  messageDays: 365,
} as const

const DAY = 86_400_000
const HOUR = 3_600_000

/** Every cutoff the sweep uses, derived from one `now` so a run is internally consistent. */
export function retentionCutoffs(now: number) {
  return {
    pulse: new Date(now - RETENTION.pulseDays * DAY),
    exodus: new Date(now - RETENTION.exodusDays * DAY),
    moopCleaned: new Date(now - RETENTION.moopCleanedDays * DAY),
    resetToken: new Date(now - RETENTION.resetTokenGraceDays * DAY),
    broadcastRecipient: new Date(now - RETENTION.broadcastRecipientDays * DAY),
    connectionIdle: new Date(now - RETENTION.connectionIdleHours * HOUR),
    connectionPending: new Date(now - RETENTION.connectionPendingDays * DAY),
    rideOpen: new Date(now - RETENTION.rideOpenDays * DAY),
    message: new Date(now - RETENTION.messageDays * DAY),
  }
}

type Db = ReturnType<typeof useDb>

/**
 * Apply the retention rules once. Each statement is independent; one failing
 * must not stop the rest, so the caller gets a count per rule and a list of
 * what threw. Safe to run any time, as often as you like.
 */
export async function runRetentionSweep(db: Db, now: number = Date.now()) {
  const c = retentionCutoffs(now)
  const counts: Record<string, number> = {}
  const errors: string[] = []

  const step = async (name: string, fn: () => Promise<unknown[]>) => {
    try {
      counts[name] = (await fn()).length
    }
    catch (e) {
      errors.push(`${name}: ${(e as Error).message}`)
    }
  }

  await step('pulse', () => db.delete(usagePulse).where(lt(usagePulse.bucket, c.pulse)).returning({ id: usagePulse.id }))
  // 2026's Meshtastic radio pings; the feature is gone, the rows should be too.
  await step('pulseMesh', () => db.delete(usagePulse).where(sql`${usagePulse.path} like 'mesh:%'`).returning({ id: usagePulse.id }))
  await step('exodus', () => db.delete(exodusReports).where(lt(exodusReports.createdAt, c.exodus)).returning({ id: exodusReports.id }))
  await step('moopCleaned', () => db.delete(moopReports)
    .where(and(eq(moopReports.status, 'cleaned'), lt(moopReports.cleanedAt, c.moopCleaned)))
    .returning({ id: moopReports.id }))
  await step('resetTokens', () => db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, c.resetToken)).returning({ id: passwordResetTokens.id }))
  await step('broadcastRecipients', () => db.delete(broadcastRecipients)
    .where(and(ne(broadcastRecipients.status, 'queued'), sql`coalesce(${broadcastRecipients.sentAt}, ${broadcastRecipients.createdAt}) < ${c.broadcastRecipient.toISOString()}::timestamptz`))
    .returning({ id: broadcastRecipients.id }))
  // Abandoned live-location shares: end them and null the positions, exactly as
  // the "end" button does, so a forgotten tab is not a standing location feed.
  await step('connectionsIdle', () => db.update(rideConnections)
    .set({ status: 'ended', ownerLat: null, ownerLng: null, ownerAt: null, requesterLat: null, requesterLng: null, requesterAt: null })
    .where(and(
      eq(rideConnections.status, 'active'),
      sql`greatest(coalesce(${rideConnections.ownerAt}, ${rideConnections.createdAt}), coalesce(${rideConnections.requesterAt}, ${rideConnections.createdAt})) < ${c.connectionIdle.toISOString()}::timestamptz`,
    ))
    .returning({ id: rideConnections.id }))
  await step('connectionsPending', () => db.update(rideConnections)
    .set({ status: 'ended' })
    .where(and(eq(rideConnections.status, 'pending'), lt(rideConnections.createdAt, c.connectionPending)))
    .returning({ id: rideConnections.id }))
  await step('ridesStale', () => db.update(rides)
    .set({ status: 'closed', updatedAt: new Date(now) })
    .where(and(eq(rides.status, 'open'), lt(rides.updatedAt, c.rideOpen)))
    .returning({ id: rides.id }))
  await step('messages', () => db.delete(messages).where(lt(messages.createdAt, c.message)).returning({ id: messages.id }))
  // Every DM used to write a who-messaged-whom audit row that outlived the
  // message itself. The route no longer writes them; this clears the backlog.
  await step('auditMessageSent', () => db.delete(auditLog).where(eq(auditLog.action, 'message_sent')).returning({ id: auditLog.id }))

  return { counts, errors }
}
