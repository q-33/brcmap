import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { users } from '../db/schema'
import { canPostGate } from '~~/lib/roles'

// The session user shape we store via setUserSession. A typed helper avoids the
// fragile #auth-utils interface augmentation (its internal User binds to a
// package-internal type that ambient augmentation can't reliably merge).
export interface SessionUser {
  id: string
  email: string
  displayName: string | null
  role: string
  features?: string[]
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const { user } = await requireUserSession(event)
  return user as unknown as SessionUser
}

// Load the live user (fresh role + feature flags from the DB) for the current
// session. Role/feature changes take effect immediately — no re-login needed.
export async function getFreshUser(event: H3Event): Promise<SessionUser | null> {
  const { user } = await getUserSession(event)
  const id = (user as unknown as { id?: string } | undefined)?.id
  if (!id)
    return null
  const [u] = await useDb().select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role }).from(users).where(eq(users.id, id)).limit(1)
  if (!u)
    return null
  return { ...u, features: await loadUserFeatures(u.id) }
}

// Require a role allowed to post Gate Road conditions — GPE crew, BM Org
// officials, or admins. Checked against the live DB role.
export async function requireGpe(event: H3Event): Promise<SessionUser> {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  if (!canPostGate(user.role))
    throw createError({ statusCode: 403, statusMessage: 'GPE access required' })
  return user
}

// Require an admin — role assignment + content moderation. Live DB role.
export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  if (user.role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  return user
}

// Require the user to have a granted feature flag (admins always pass). Live.
export async function requireFeature(event: H3Event, feature: string): Promise<SessionUser> {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  if (user.role !== 'admin' && !(user.features ?? []).includes(feature))
    throw createError({ statusCode: 403, statusMessage: 'This feature isn’t enabled for your account' })
  return user
}

// Like requireUser, but returns null instead of throwing when not logged in.
// For endpoints whose response varies by viewer (e.g. owner sees pending items).
export async function getOptionalUser(event: H3Event): Promise<SessionUser | null> {
  const { user } = await getUserSession(event)
  return (user as unknown as SessionUser) ?? null
}
