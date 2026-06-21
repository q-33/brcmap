<script setup lang="ts">
interface AdminUser { id: string, email: string, displayName: string | null, role: string, createdAt: string }
interface Content {
  camps: { id: string, name: string, year: number, owner: string | null, locations: number, hidden: boolean }[]
  art: { id: string, name: string, year: number, owner: string | null, locations: number, contributions: number, pending: number, hidden: boolean }[]
  events: { id: string, title: string, camp: string | null, startsAt: string }[]
}

const { loggedIn, user } = useUserSession()
const myId = computed(() => (user.value as any)?.id)
const isAdmin = computed(() => (user.value as any)?.role === 'admin')

const { data: users, refresh: refreshUsers } = await useFetch<AdminUser[]>('/api/admin/users', { immediate: false, default: () => [] })
const { data: content, refresh: refreshContent } = await useFetch<Content>('/api/admin/content', { immediate: false, default: () => ({ camps: [], art: [], events: [] }) })
watch(isAdmin, (v) => { if (v) { refreshUsers(); refreshContent() } }, { immediate: true })

const roleItems = [{ label: 'User', value: 'user' }, { label: 'GPE', value: 'gpe' }, { label: 'Admin', value: 'admin' }]
const q = ref('')
const filteredUsers = computed(() =>
  (users.value ?? []).filter(u => !q.value || `${u.email} ${u.displayName ?? ''}`.toLowerCase().includes(q.value.toLowerCase())))

const tab = ref<'camps' | 'art' | 'events'>('camps')
const busy = ref('')
const msg = ref('')

async function setRole(u: AdminUser, role: string) {
  busy.value = u.id
  msg.value = ''
  try {
    await $fetch(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role } })
    msg.value = `${u.email} → ${role}`
    await refreshUsers()
  }
  catch (e: any) {
    msg.value = e?.data?.statusMessage ?? 'Could not update role'
  }
  finally {
    busy.value = ''
  }
}

async function toggleHidden(type: 'camps' | 'art', id: string, hidden: boolean) {
  busy.value = id
  try {
    await $fetch(`/api/admin/${type}/${id}`, { method: 'PATCH', body: { hidden } })
    await refreshContent()
  }
  catch (e: any) {
    msg.value = e?.data?.statusMessage ?? 'Could not update'
  }
  finally {
    busy.value = ''
  }
}

async function del(type: 'camps' | 'art' | 'events', id: string, label: string) {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`Delete “${label}”? This permanently removes it and its data.`))
    return
  busy.value = id
  try {
    await $fetch(`/api/admin/${type}/${id}`, { method: 'DELETE' })
    await refreshContent()
  }
  catch (e: any) {
    msg.value = e?.data?.statusMessage ?? 'Could not delete'
  }
  finally {
    busy.value = ''
  }
}

useHead({ title: 'Admin — BurnerMap' })
</script>

<template>
  <UContainer class="max-w-4xl py-10 sm:py-14">
    <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Admin</h1>

    <div v-if="!isAdmin" class="mt-8 rounded-xl border border-(--ui-border) p-6 text-center text-(--ui-text-muted)">
      <UIcon name="i-lucide-lock" class="mx-auto mb-2 size-8 opacity-40" />
      <p v-if="!loggedIn">Please <NuxtLink to="/?login=1" class="text-primary underline">log in</NuxtLink> as an admin.</p>
      <p v-else>Your account doesn’t have admin access.</p>
    </div>

    <template v-else>
      <p v-if="msg" class="mt-3 text-sm text-(--ui-text-muted)">{{ msg }}</p>

      <!-- Roles -->
      <section class="mt-8">
        <div class="mb-3 flex items-end justify-between gap-3">
          <h2 class="font-display text-xl font-semibold text-primary">People & roles</h2>
          <UBadge color="neutral" variant="subtle">{{ users?.length ?? 0 }} users</UBadge>
        </div>
        <UInput v-model="q" icon="i-lucide-search" placeholder="Search by email or name…" class="mb-3 w-full" />
        <div class="divide-y divide-(--ui-border) overflow-hidden rounded-xl border border-(--ui-border)">
          <div v-for="u in filteredUsers" :key="u.id" class="flex items-center gap-3 px-3 py-2">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ u.displayName || '—' }}</p>
              <p class="truncate text-xs text-(--ui-text-muted)">{{ u.email }}</p>
            </div>
            <UBadge v-if="u.id === myId" color="primary" variant="subtle" size="xs">you</UBadge>
            <USelect
              :model-value="u.role"
              :items="roleItems"
              :disabled="u.id === myId || busy === u.id"
              size="sm"
              class="w-28"
              @update:model-value="(r:string) => setRole(u, r)"
            />
          </div>
          <p v-if="!filteredUsers.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">No users match.</p>
        </div>
      </section>

      <!-- Content moderation -->
      <section class="mt-12">
        <h2 class="mb-3 font-display text-xl font-semibold text-primary">Moderate content</h2>
        <div class="mb-4 flex gap-1">
          <UButton
            v-for="t in (['camps', 'art', 'events'] as const)"
            :key="t"
            :color="tab === t ? 'primary' : 'neutral'"
            :variant="tab === t ? 'solid' : 'ghost'"
            size="xs"
            class="capitalize"
            @click="tab = t"
          >
            {{ t }} ({{ content?.[t]?.length ?? 0 }})
          </UButton>
        </div>

        <div class="divide-y divide-(--ui-border) overflow-hidden rounded-xl border border-(--ui-border)">
          <!-- camps -->
          <template v-if="tab === 'camps'">
            <div v-for="c in content?.camps" :key="c.id" class="flex items-center gap-3 px-3 py-2" :class="c.hidden && 'opacity-55'">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">
                  {{ c.name }} <span class="text-(--ui-text-muted)">· {{ c.year }}</span>
                  <UBadge v-if="c.hidden" color="neutral" variant="subtle" size="xs" class="ml-1">hidden</UBadge>
                </p>
                <p class="truncate text-xs text-(--ui-text-muted)">{{ c.owner ?? 'no owner' }} · {{ c.locations }} location(s)</p>
              </div>
              <UButton :color="c.hidden ? 'primary' : 'neutral'" variant="ghost" size="xs" :icon="c.hidden ? 'i-lucide-eye' : 'i-lucide-eye-off'" :loading="busy === c.id" @click="toggleHidden('camps', c.id, !c.hidden)">{{ c.hidden ? 'Show' : 'Hide' }}</UButton>
              <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" :loading="busy === c.id" @click="del('camps', c.id, c.name)">Delete</UButton>
            </div>
            <p v-if="!content?.camps?.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">No camps.</p>
          </template>
          <!-- art -->
          <template v-else-if="tab === 'art'">
            <div v-for="a in content?.art" :key="a.id" class="flex items-center gap-3 px-3 py-2" :class="a.hidden && 'opacity-55'">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">
                  {{ a.name }} <span class="text-(--ui-text-muted)">· {{ a.year }}</span>
                  <UBadge v-if="a.hidden" color="neutral" variant="subtle" size="xs" class="ml-1">hidden</UBadge>
                </p>
                <p class="truncate text-xs text-(--ui-text-muted)">
                  {{ a.owner ?? 'no owner' }} · {{ a.contributions }} contribution(s)<span v-if="a.pending"> · {{ a.pending }} pending</span>
                </p>
              </div>
              <UButton :to="`/art/${a.id}`" variant="ghost" size="xs" icon="i-lucide-external-link">Open</UButton>
              <UButton :color="a.hidden ? 'primary' : 'neutral'" variant="ghost" size="xs" :icon="a.hidden ? 'i-lucide-eye' : 'i-lucide-eye-off'" :loading="busy === a.id" @click="toggleHidden('art', a.id, !a.hidden)">{{ a.hidden ? 'Show' : 'Hide' }}</UButton>
              <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" :loading="busy === a.id" @click="del('art', a.id, a.name)">Delete</UButton>
            </div>
            <p v-if="!content?.art?.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">No art.</p>
          </template>
          <!-- events -->
          <template v-else>
            <div v-for="e in content?.events" :key="e.id" class="flex items-center gap-3 px-3 py-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ e.title }}</p>
                <p class="truncate text-xs text-(--ui-text-muted)">{{ e.camp ?? '—' }} · {{ e.startsAt?.replace('T', ' ') }}</p>
              </div>
              <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" :loading="busy === e.id" @click="del('events', e.id, e.title)">Delete</UButton>
            </div>
            <p v-if="!content?.events?.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">No events.</p>
          </template>
        </div>
      </section>
    </template>
  </UContainer>
</template>
