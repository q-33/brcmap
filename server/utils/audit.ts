import { eq } from 'drizzle-orm'
import { auditLog, userFeatures } from '../db/schema'

// Append a moderation/admin action to the audit log. Best-effort — never throws
// into the caller (logging must not break the action it records).
export async function audit(actorId: string, action: string, opts?: { targetType?: string, targetId?: string, detail?: string }) {
  try {
    await useDb().insert(auditLog).values({
      actorId,
      action,
      targetType: opts?.targetType ?? null,
      targetId: opts?.targetId ?? null,
      detail: opts?.detail ?? null,
    })
  }
  catch {
    // swallow — audit logging is non-critical
  }
}

// The feature keys currently granted to a user (for the session).
export async function loadUserFeatures(userId: string): Promise<string[]> {
  const rows = await useDb().select({ feature: userFeatures.feature }).from(userFeatures).where(eq(userFeatures.userId, userId))
  return rows.map(r => r.feature)
}
