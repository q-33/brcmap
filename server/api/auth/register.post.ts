import { eq } from 'drizzle-orm'
import { registerSchema } from '../../utils/validation'
import { users } from '../../db/schema'

export default defineEventHandler(async (event) => {
  // Throttle account-creation spam + email-enumeration probing.
  rateLimit(event, 'register-ip', 5, 60 * 60_000)
  const { email, password, displayName } = await readValidatedBody(event, registerSchema.parse)
  const db = useDb()

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1)
  if (existing.length)
    throw createError({ statusCode: 409, statusMessage: 'An account with that email already exists' })

  const passwordHash = await hashPassword(password)
  const [user] = await db
    .insert(users)
    .values({ email: email.toLowerCase(), passwordHash, displayName: displayName ?? null })
    .returning({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
  if (!user)
    throw createError({ statusCode: 500, statusMessage: 'Could not create account' })

  const sessionUser = { id: user.id, email: user.email, displayName: user.displayName, role: user.role, features: [] as string[] }
  await setUserSession(event, { user: sessionUser })
  return { user }
})
