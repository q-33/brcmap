import type { H3Event } from 'h3'

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

// Require a GPE (Gate, Perimeter & Exodus) crew member or an admin — the roles
// allowed to post Gate Road conditions.
export async function requireGpe(event: H3Event): Promise<SessionUser> {
  const user = await requireUser(event)
  if (user.role !== 'gpe' && user.role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'GPE access required' })
  return user
}

// Require an admin — role assignment + content moderation.
export async function requireAdmin(event: H3Event): Promise<SessionUser> {
  const user = await requireUser(event)
  if (user.role !== 'admin')
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  return user
}

// Require the user to have a granted feature flag (admins always pass).
export async function requireFeature(event: H3Event, feature: string): Promise<SessionUser> {
  const user = await requireUser(event)
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
