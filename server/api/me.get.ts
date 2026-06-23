import { and, count, eq, isNull } from 'drizzle-orm'
import { artClaims, messages } from '../db/schema'

// The current user with LIVE role + feature flags (vs. the session snapshot from
// login), the unread-message count for the inbox badge, and (for admins) the
// pending art-claim count for the admin nav badge. The client fetches this on
// load so role/feature grants apply without requiring a re-login.
// Returns null when not signed in.
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    return null
  const db = useDb()
  const [row] = await db
    .select({ n: count() }).from(messages)
    .where(and(eq(messages.recipientId, user.id), isNull(messages.readAt)))
  let pendingClaims = 0
  if (user.role === 'admin') {
    const [c] = await db.select({ n: count() }).from(artClaims).where(eq(artClaims.status, 'pending'))
    pendingClaims = c?.n ?? 0
  }
  return { ...user, unreadMessages: row?.n ?? 0, pendingClaims }
})
