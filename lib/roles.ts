// Single source of truth for user roles + what each can do. Imported by both the
// server (auth guards, camp endpoints) and the client (useMe, admin picker) so
// the two never drift. Roles are stored as plain text on users.role.
export type Role = 'user' | 'gpe' | 'admin' | 'org' | 'tco'

// Order shown in the admin role picker (broadest reach last).
export const ROLES: { value: Role, label: string, hint: string }[] = [
  { value: 'user', label: 'User', hint: 'Browse the map' },
  { value: 'tco', label: 'Theme Camp Org', hint: 'Create & manage their own camp' },
  { value: 'gpe', label: 'GPE', hint: 'Post Gate Road conditions' },
  { value: 'org', label: 'BM Org', hint: 'Place any camp + post gate conditions' },
  { value: 'admin', label: 'Admin', hint: 'Full access' },
]

export function roleLabel(role?: string | null): string {
  return ROLES.find(r => r.value === role)?.label ?? 'User'
}

// --- Capabilities (derive behaviour from these, not from raw role strings) ---

/** Post Gate Road conditions: GPE crew, BM Org officials, or admins. */
export function canPostGate(role?: string | null): boolean {
  return role === 'gpe' || role === 'org' || role === 'admin'
}

/** Place / edit / move ANY camp (not just one you own): BM Org or admins. */
export function canManageAnyCamp(role?: string | null): boolean {
  return role === 'org' || role === 'admin'
}

/** Create a new camp: Theme Camp Organizers, BM Org, or admins. */
export function canCreateCamp(role?: string | null): boolean {
  return role === 'tco' || role === 'org' || role === 'admin'
}
