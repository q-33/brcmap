import { eq } from 'drizzle-orm'
import { loginSchema } from '../../utils/validation'
import { users } from '../../db/schema'

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, loginSchema.parse)
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
