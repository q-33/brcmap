import { canManageAnyCamp, canOwnMultipleCamps } from '~~/lib/roles'

export interface Me { id: string, email: string, displayName: string | null, role: string, features: string[], unreadMessages?: number }

// The current user with LIVE role + feature flags, fetched from /api/me (not the
// login session snapshot) so role/feature grants apply without re-login.
export function useMe() {
  const me = useState<Me | null>('me', () => null)
  const isAdmin = computed(() => me.value?.role === 'admin')
  // Camp capabilities (single source of truth in ~~/lib/roles).
  const canManageCamps = computed(() => canManageAnyCamp(me.value?.role))
  // May own more than one camp (Hubs, plus Org/admins). Drives the multi-camp UI.
  const canMultiCamp = computed(() => canOwnMultipleCamps(me.value?.role))
  const unreadMessages = computed(() => me.value?.unreadMessages ?? 0)

  function hasFeature(key: string): boolean {
    const m = me.value
    return !!m && (m.role === 'admin' || m.features.includes(key))
  }

  async function refreshMe() {
    try {
      me.value = await $fetch<Me | null>('/api/me')
    }
    catch {
      me.value = null
    }
  }

  return { me, isAdmin, canManageCamps, canMultiCamp, unreadMessages, hasFeature, refreshMe }
}
