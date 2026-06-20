import type { H3Event } from 'h3'

// The session user shape we store via setUserSession. A typed helper avoids the
// fragile #auth-utils interface augmentation (its internal User binds to a
// package-internal type that ambient augmentation can't reliably merge).
export interface SessionUser {
  id: string
  email: string
  displayName: string | null
}

export async function requireUser(event: H3Event): Promise<SessionUser> {
  const { user } = await requireUserSession(event)
  return user as unknown as SessionUser
}
