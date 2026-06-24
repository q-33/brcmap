import { and, eq, isNull } from 'drizzle-orm'
import { messages, users } from '../../db/schema'
import { messageSchema } from '../../utils/validation'

// Send a 1:1 direct message to another registered user.
export default defineEventHandler(async (event) => {
  const sender = await requireUser(event)
  // Cap message volume per sender (the email nudge makes this an abuse vector).
  rateLimit(event, 'msg', 20, 10 * 60_000, sender.id)
  const { recipientId, body } = await readValidatedBody(event, messageSchema.parse)

  if (recipientId === sender.id)
    throw createError({ statusCode: 400, statusMessage: 'You can’t message yourself' })

  const db = useDb()
  const [recipient] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users).where(eq(users.id, recipientId)).limit(1)
  if (!recipient)
    throw createError({ statusCode: 404, statusMessage: 'Recipient not found' })

  // Is this the first unread from this sender? (drives the email nudge so an
  // active conversation doesn't trigger an email on every reply.)
  const [existingUnread] = await db
    .select({ id: messages.id }).from(messages)
    .where(and(eq(messages.senderId, sender.id), eq(messages.recipientId, recipientId), isNull(messages.readAt)))
    .limit(1)

  const [created] = await db.insert(messages)
    .values({ senderId: sender.id, recipientId, body })
    .returning({ id: messages.id, body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId })

  await audit(sender.id, 'message_sent', { targetType: 'user', targetId: recipientId })

  // Best-effort "you have a new message" nudge (no-op if email isn't configured).
  if (!existingUnread) {
    const fromName = sender.displayName || sender.email
    notifyNewMessage(recipient.email, fromName, body).catch(() => {})
  }

  return created
})
