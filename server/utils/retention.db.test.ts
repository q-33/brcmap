import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as schema from '../db/schema'
import { TEST_URL, freshDb } from '../../tests/db/localDb'
import { runRetentionSweep } from './retention'

// Runs only with TEST_DATABASE_URL set (see tests/db/localDb.ts). This is the
// check that the sweep's SQL is right — the two raw coalesce()/greatest()
// comparisons failed type inference the first time, and nothing short of a
// real Postgres would have said so.
describe.skipIf(!TEST_URL)('retention sweep against Postgres', () => {
  const DAY = 86_400_000; const H = 3_600_000
  const now = Date.now(); const ago = (ms: number) => new Date(now - ms)
  let sql: Awaited<ReturnType<typeof freshDb>>['sql']
  let db: Awaited<ReturnType<typeof freshDb>>['db']
  let result: Awaited<ReturnType<typeof runRetentionSweep>>
  const count = async (t: string, where = 'true') => Number((await sql.unsafe(`select count(*)::int n from ${t} where ${where}`))[0]!.n)

  beforeAll(async () => {
    ;({ sql, db } = await freshDb())
    const [u1, u2] = await db.insert(schema.users).values([{ email: 'a@test', passwordHash: 'x' }, { email: 'b@test', passwordHash: 'x' }]).returning({ id: schema.users.id })
    await db.insert(schema.usagePulse).values([
      { visitor: 'v1', path: '/', bucket: ago(1 * DAY) },
      { visitor: 'v2', path: '/', bucket: ago(9 * DAY) },
      { visitor: 'v3', path: 'mesh:connected', bucket: ago(1 * DAY) },
    ])
    await db.insert(schema.exodusReports).values([{ visitor: 'v1', minutes: 60, createdAt: ago(1 * DAY) }, { visitor: 'v2', minutes: 60, createdAt: ago(15 * DAY) }])
    await db.insert(schema.moopReports).values([
      { visitor: 'v1', lat: 40.78, lng: -119.2, category: 'debris', status: 'open', createdAt: ago(60 * DAY) },
      { visitor: 'v1', lat: 40.78, lng: -119.2, category: 'debris', status: 'cleaned', cleanedAt: ago(31 * DAY) },
      { visitor: 'v1', lat: 40.78, lng: -119.2, category: 'debris', status: 'cleaned', cleanedAt: ago(2 * DAY) },
    ])
    await db.insert(schema.passwordResetTokens).values([
      { userId: u1!.id, tokenHash: 'h1', expiresAt: ago(2 * DAY) }, { userId: u1!.id, tokenHash: 'h2', expiresAt: new Date(now + H) },
    ])
    const [b] = await db.insert(schema.broadcasts).values({ subject: 's', body: 'b' }).returning({ id: schema.broadcasts.id })
    await db.insert(schema.broadcastRecipients).values([
      { broadcastId: b!.id, email: 'old-sent@test', status: 'sent', sentAt: ago(40 * DAY), createdAt: ago(40 * DAY) },
      { broadcastId: b!.id, email: 'old-queued@test', status: 'queued', createdAt: ago(40 * DAY) },
      { broadcastId: b!.id, email: 'new-sent@test', status: 'sent', sentAt: ago(1 * DAY) },
    ])
    const [, rFresh, rPending] = await db.insert(schema.rides).values([
      { ownerId: u1!.id, kind: 'offer', destination: 'Reno', status: 'open', createdAt: ago(60 * DAY), updatedAt: ago(60 * DAY) },
      { ownerId: u1!.id, kind: 'offer', destination: 'Reno', status: 'open', createdAt: ago(2 * DAY), updatedAt: ago(2 * DAY) },
      { ownerId: u1!.id, kind: 'request', destination: 'SF', status: 'open' },
    ]).returning({ id: schema.rides.id })
    await db.insert(schema.rideConnections).values([
      // both sides silent > 6h: ends, positions nulled
      { rideId: rFresh!.id, requesterId: u2!.id, status: 'active', ownerLat: 1, ownerLng: 1, ownerAt: ago(7 * H), requesterLat: 2, requesterLng: 2, requesterAt: ago(8 * H), createdAt: ago(9 * H) },
      // one side fresh: stays
      { rideId: rFresh!.id, requesterId: u1!.id, status: 'active', ownerLat: 1, ownerLng: 1, ownerAt: ago(1 * H), requesterLat: 2, requesterLng: 2, requesterAt: ago(7 * H), createdAt: ago(9 * H) },
      { rideId: rPending!.id, requesterId: u2!.id, status: 'pending', createdAt: ago(8 * DAY) },
      { rideId: rPending!.id, requesterId: u1!.id, status: 'pending', createdAt: ago(1 * DAY) },
    ])
    await db.insert(schema.messages).values([
      { senderId: u1!.id, recipientId: u2!.id, body: 'old', createdAt: ago(366 * DAY) },
      { senderId: u1!.id, recipientId: u2!.id, body: 'new', createdAt: ago(300 * DAY) },
    ])
    await db.insert(schema.auditLog).values([{ actorId: u1!.id, action: 'message_sent' }, { actorId: u1!.id, action: 'camp.hide' }])
    result = await runRetentionSweep(db as any, now)
  }, 60_000)
  afterAll(async () => { await sql?.end() })

  it('runs every rule without error', () => {
    expect(result.errors).toEqual([])
    expect(Object.keys(result.counts)).toHaveLength(11)
  })
  it('deletes only the aged pulse rows plus the 2026 mesh pings', async () => expect(await count('usage_pulse')).toBe(1))
  it('keeps two weeks of exodus reports', async () => expect(await count('exodus_reports')).toBe(1))
  it('drops cleaned MOOP a month on, never open pins', async () => {
    expect(await count('moop_reports')).toBe(2)
    expect(await count('moop_reports', "status='open'")).toBe(1)
  })
  it('clears expired reset tokens', async () => expect(await count('password_reset_tokens')).toBe(1))
  it('forgets sent broadcast addresses after a month, never queued ones', async () => {
    expect(await count('broadcast_recipients')).toBe(2)
    expect(await count('broadcast_recipients', "status='queued'")).toBe(1)
  })
  it('ends idle live-location shares with positions nulled; a fresh side keeps it alive', async () => {
    expect(await count('ride_connections', "status='active'")).toBe(1)
    expect(await count('ride_connections', "status='ended' and (owner_lat is not null or requester_lat is not null)")).toBe(0)
    expect(await count('ride_connections', "status='pending'")).toBe(1)
  })
  it('closes rides left open across a season', async () => expect(await count('rides', "status='open'")).toBe(2))
  it('purges messages a year on', async () => expect(await count('messages')).toBe(1))
  it('removes the who-messaged-whom audit rows and nothing else', async () => {
    expect(await count('audit_log')).toBe(1)
    expect(await count('audit_log', "action='camp.hide'")).toBe(1)
  })
})
