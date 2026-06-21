import { eq } from 'drizzle-orm'
import { registerSchema } from '../../utils/validation'
import { users } from '../../db/schema'

export default defineEventHandler(async (event) => {
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

  await setUserSession(event, { user })
  return { user }
})
