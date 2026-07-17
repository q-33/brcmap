import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { passwordResetTokens, users } from '../../db/schema'
import { forgotPasswordSchema } from '../../utils/validation'

const SITE_URL = process.env.PUBLIC_SITE_URL ?? 'https://brcmap.net'

// Start a password reset: if the email belongs to an account, store a hashed,
// 1-hour, single-use token and email the raw token as a link. Always returns a
// generic response so it doesn't reveal which emails are registered.
export default defineEventHandler(async (event) => {
  rateLimit(event, 'forgot-ip', 6, 15 * 60_000)
  const { email } = await readValidatedBody(event, forgotPasswordSchema.parse)
  rateLimit(event, 'forgot-email', 4, 30 * 60_000, email.toLowerCase())
  const db = useDb()

  const [user] = await db.select({ id: users.id, email: users.email })
    .from(users).where(eq(users.email, email.toLowerCase())).limit(1)

  if (user) {
    const raw = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(raw).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60_000)
    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt })
    await sendPasswordReset(user.email, `${SITE_URL}/reset-password?token=${raw}`).catch(() => {})
  }

  return { ok: true }
})
