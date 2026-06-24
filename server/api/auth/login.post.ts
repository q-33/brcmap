import { eq } from 'drizzle-orm'
import { loginSchema } from '../../utils/validation'
import { users } from '../../db/schema'

export default defineEventHandler(async (event) => {
  // Throttle online password guessing: per-IP and per-targeted-email.
  rateLimit(event, 'login-ip', 12, 5 * 60_000)
  const { email, password } = await readValidatedBody(event, loginSchema.parse)
  rateLimit(event, 'login-email', 8, 15 * 60_000, email.toLowerCase())
  const db = useDb()

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1)
  // Verify even when the user is missing-ish to keep timing uniform.
  const ok = user ? await verifyPassword(user.passwordHash, password) : false
  if (!user || !ok)
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })

  const features = await loadUserFeatures(user.id)
  const sessionUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, features }
  await setUserSession(event, { user: sessionUser })
  return { user: sessionUser }
})
