// Single source of truth for user roles + what each can do. Imported by both the
// server (auth guards, camp endpoints) and the client (useMe, admin picker) so
// the two never drift. Roles are stored as plain text on users.role.
export type Role = 'user' | 'admin' | 'org' | 'tco' | 'hubs'

// Order shown in the admin role picker (broadest reach last).
export const ROLES: { value: Role, label: string, hint: string }[] = [
  { value: 'user', label: 'User', hint: 'Browse the map' },
  { value: 'tco', label: 'Theme Camp Org', hint: 'Create & manage their own camp' },
  { value: 'hubs', label: 'Hub', hint: 'Create & place/edit any camp' },
  { value: 'org', label: 'BM Org', hint: 'Place any camp' },
  { value: 'admin', label: 'Admin', hint: 'Full access' },
]

export function roleLabel(role?: string | null): string {
  return ROLES.find(r => r.value === role)?.label ?? 'User'
}

// --- Capabilities (derive behaviour from these, not from raw role strings) ---

/** Place / edit / move ANY camp (not just one you own): Hubs, BM Org, or admins.
 *  (Deleting a camp stays admin-only — see the admin camp endpoints.) */
export function canManageAnyCamp(role?: string | null): boolean {
  return role === 'hubs' || role === 'org' || role === 'admin'
}

/** Create a new camp: Theme Camp Organizers, BM Org, or admins. */
export function canCreateCamp(role?: string | null): boolean {
  return role === 'tco' || role === 'org' || role === 'admin'
}

/**
 * Own MORE THAN ONE camp (create/edit/move several camps you own): Hubs, plus
 * BM Org & admins (who can already place/edit any camp). Everyone else is capped
 * at a single camp.
 */
export function canOwnMultipleCamps(role?: string | null): boolean {
  return role === 'hubs' || canManageAnyCamp(role)
}
