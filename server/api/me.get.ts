import { and, count, eq, isNull } from 'drizzle-orm'
import { messages } from '../db/schema'

// The current user with LIVE role + feature flags (vs. the session snapshot from
// login) and the unread-message count for the inbox badge. The client fetches
// this on load so role/feature grants apply without requiring a re-login.
// Read-only (no side effects) — presence is recorded via POST /api/presence.
// Returns null when not signed in.
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    return null
  const db = useDb()
  const [row] = await db
    .select({ n: count() }).from(messages)
    .where(and(eq(messages.recipientId, user.id), isNull(messages.readAt)))
  return { ...user, unreadMessages: row?.n ?? 0 }
})
