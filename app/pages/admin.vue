<script setup lang="ts">
import { FEATURES } from '~~/lib/features'
import { ROLES, roleLabel } from '~~/lib/roles'

interface AdminUser { id: string, email: string, displayName: string | null, role: string, createdAt: string, features: string[] }
interface AdminCamp {
  id: string, name: string, year: number, owner: string | null, locations: number, hidden: boolean
  description: string | null, website: string | null, contactEmail: string | null, hometown: string | null
  frontageFt: number | null, depthFt: number | null, lat: number | null, lng: number | null, address: string | null
}
interface Content {
  camps: AdminCamp[]
  art: { id: string, name: string, year: number, owner: string | null, locations: number, contributions: number, pending: number, hidden: boolean, artist: string | null, description: string | null, website: string | null, contactEmail: string | null, hometown: string | null }[]
  events: { id: string, title: string, camp: string | null, startsAt: string }[]
}
interface QueueItem { id: string, body: string, language: string | null, mediaUrl: string | null, authorName: string | null, createdAt: string, artId: string | null, artName: string }
interface ClaimItem { id: string, message: string | null, createdAt: string, artId: string | null, artName: string, artArtist: string | null, claimant: string, claimantEmail: string | null }
interface OnlineUser { id: string, email: string, displayName: string | null, role: string, lastSeenAt: string | null }
interface Recent { type: string, id: string, label: string, createdAt: string }
interface Audit { id: string, action: string, actor: string, targetType: string | null, targetId: string | null, detail: string | null, createdAt: string }

const { loggedIn } = useUserSession()
const { me, isAdmin, refreshMe } = useMe()
const myId = computed(() => me.value?.id)

const { data: users, refresh: refreshUsers } = await useFetch<AdminUser[]>('/api/admin/users', { immediate: false, default: () => [] })
const { data: content, refresh: refreshContent } = await useFetch<Content>('/api/admin/content', { immediate: false, default: () => ({ camps: [], art: [], events: [] }) })
const { data: queue, refresh: refreshQueue } = await useFetch<QueueItem[]>('/api/admin/contributions', { immediate: false, default: () => [] })
const { data: claims, refresh: refreshClaims } = await useFetch<ClaimItem[]>('/api/admin/claims', { immediate: false, default: () => [] })
const { data: online, refresh: refreshOnline } = await useFetch<OnlineUser[]>('/api/admin/online', { immediate: false, default: () => [] })
const { data: recent, refresh: refreshRecent } = await useFetch<Recent[]>('/api/admin/recent', { immediate: false, default: () => [] })
const { data: auditRows, refresh: refreshAudit } = await useFetch<Audit[]>('/api/admin/audit', { immediate: false, default: () => [] })
watch(isAdmin, (v) => {
  if (v) {
    refreshUsers()
    refreshContent()
    refreshQueue()
    refreshClaims()
    refreshOnline()
    refreshRecent()
    refreshAudit()
  }
}, { immediate: true })

// "Online" = active within the last 5 minutes (a few missed 60s heartbeats).
const ONLINE_MS = 5 * 60 * 1000
const nowTick = ref(Date.now())
const isOnline = (u: OnlineUser) => !!u.lastSeenAt && nowTick.value - +new Date(u.lastSeenAt) < ONLINE_MS
const onlineCount = computed(() => (online.value ?? []).filter(isOnline).length)

const tabs = computed(() => [
  { key: 'queue', label: 'Queue', n: queue.value?.length ?? 0 },
  { key: 'claims', label: 'Claims', n: claims.value?.length ?? 0 },
  { key: 'online', label: 'Online', n: onlineCount.value },
  { key: 'people', label: 'People', n: users.value?.length ?? 0 },
  { key: 'content', label: 'Content', n: undefined },
  { key: 'recent', label: 'Recent', n: undefined },
  { key: 'audit', label: 'Audit', n: undefined },
] as const)
type Tab = 'queue' | 'claims' | 'online' | 'people' | 'content' | 'recent' | 'audit'
const route = useRoute()
const validTabs: Tab[] = ['queue', 'claims', 'online', 'people', 'content', 'recent', 'audit']
const tab = ref<Tab>(validTabs.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'queue')
watch(() => route.query.tab, (t) => { if (validTabs.includes(t as Tab)) tab.value = t as Tab })
const ctab = ref<'camps' | 'art' | 'events'>('camps')

const q = ref('')
const filteredUsers = computed(() =>
  (users.value ?? []).filter(u => !q.value || `${u.email} ${u.displayName ?? ''}`.toLowerCase().includes(q.value.toLowerCase())))
const roleItems = ROLES.map(r => ({ label: r.label, value: r.value as string }))

const busy = ref('')
const msg = ref('')

function rel(ts: string): string {
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000)
  if (!Number.isFinite(mins))
    return ''
  if (mins < 1)
    return 'just now'
  if (mins < 60)
    return `${mins}m ago`
  if (mins < 1440)
    return `${Math.round(mins / 60)}h ago`
  return new Date(ts).toLocaleDateString()
}

async function setRole(u: AdminUser, role: string) {
  busy.value = u.id
  msg.value = ''
  try {
    await $fetch(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role } })
    msg.value = `${u.email} → ${role}`
    await refreshUsers()
    await refreshAudit()
  }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not update role' }
  finally { busy.value = '' }
}

async function toggleFeature(u: AdminUser, key: string) {
  const features = u.features.includes(key) ? u.features.filter(f => f !== key) : [...u.features, key]
  busy.value = u.id
  try {
    await $fetch(`/api/admin/users/${u.id}/features`, { method: 'PUT', body: { features } })
    await refreshUsers()
    await refreshAudit()
  }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not update features' }
  finally { busy.value = '' }
}

async function toggleHidden(type: 'camps' | 'art', id: string, hidden: boolean) {
  busy.value = id
  try { await $fetch(`/api/admin/${type}/${id}`, { method: 'PATCH', body: { hidden } }); await refreshContent(); await refreshAudit() }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not update' }
  finally { busy.value = '' }
}

async function del(type: 'camps' | 'art' | 'events', id: string, label: string) {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`Delete “${label}”? This permanently removes it and its data.`))
    return
  busy.value = id
  try { await $fetch(`/api/admin/${type}/${id}`, { method: 'DELETE' }); await refreshContent(); await refreshRecent(); await refreshAudit() }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not delete' }
  finally { busy.value = '' }
}

// Convert an artwork a user accidentally dropped as art into a camp.
async function convertToCamp(id: string, label: string) {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`Convert “${label}” from art to a camp? Its pin moves to a new camp owned by the same user, and the art entry is removed.`))
    return
  busy.value = id
  try { await $fetch(`/api/admin/art/${id}/to-camp`, { method: 'POST' }); await refreshContent(); await refreshRecent(); await refreshAudit() }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not convert' }
  finally { busy.value = '' }
}

// --- edit a camp's details (admin) -----------------------------------------
const campEditOpen = ref(false)
const campEditId = ref('')
const campForm = reactive({ name: '', description: '', website: '', hometown: '', contactEmail: '', frontageFt: null as number | null, depthFt: null as number | null })
const campEditBusy = ref(false)
const campEditError = ref('')

function openCampEdit(c: AdminCamp) {
  campEditId.value = c.id
  campForm.name = c.name
  campForm.description = c.description ?? ''
  campForm.website = c.website ?? ''
  campForm.hometown = c.hometown ?? ''
  campForm.contactEmail = c.contactEmail ?? ''
  campForm.frontageFt = c.frontageFt
  campForm.depthFt = c.depthFt
  campEditError.value = ''
  campOwnerEmail.value = c.owner ?? ''
  campOwnerMsg.value = ''
  campEditOpen.value = true
}

async function saveCampEdit() {
  if (!campForm.name.trim())
    return
  campEditBusy.value = true
  campEditError.value = ''
  try {
    await $fetch(`/api/camps/${campEditId.value}`, { method: 'PATCH', body: { ...campForm } })
    await refreshContent()
    campEditOpen.value = false
  }
  catch (e: any) {
    campEditError.value = e?.data?.statusMessage ?? 'Could not save'
  }
  finally {
    campEditBusy.value = false
  }
}

// Reassign who owns this camp (by their account email) so they can edit it and
// post its events. Separate from the details form — a different, riskier action.
const campOwnerEmail = ref('')
const campOwnerBusy = ref(false)
const campOwnerMsg = ref('')

async function assignCampOwner() {
  const email = campOwnerEmail.value.trim()
  if (!email)
    return
  campOwnerBusy.value = true
  campOwnerMsg.value = ''
  try {
    const r = await $fetch<{ ownerEmail: string }>(`/api/admin/camps/${campEditId.value}/owner`, { method: 'PATCH', body: { email } })
    campOwnerMsg.value = `✓ Owner set to ${r.ownerEmail}`
    await refreshContent()
  }
  catch (e: any) {
    campOwnerMsg.value = e?.data?.statusMessage ?? 'Could not assign owner'
  }
  finally {
    campOwnerBusy.value = false
  }
}

// --- edit an artwork's details (admin) -------------------------------------
type AdminArt = Content['art'][number]
const artEditOpen = ref(false)
const artEditId = ref('')
const artForm = reactive({ name: '', artist: '', year: 2026, description: '', website: '', hometown: '', contactEmail: '' })
const artEditBusy = ref(false)
const artEditError = ref('')

function openArtEdit(a: AdminArt) {
  artEditId.value = a.id
  artForm.name = a.name
  artForm.artist = a.artist ?? ''
  artForm.year = a.year
  artForm.description = a.description ?? ''
  artForm.website = a.website ?? ''
  artForm.hometown = a.hometown ?? ''
  artForm.contactEmail = a.contactEmail ?? ''
  artEditError.value = ''
  artEditOpen.value = true
}

async function saveArtEdit() {
  if (!artForm.name.trim())
    return
  artEditBusy.value = true
  artEditError.value = ''
  try {
    await $fetch(`/api/admin/art/${artEditId.value}/details`, { method: 'PATCH', body: { ...artForm } })
    await refreshContent()
    await refreshAudit()
    artEditOpen.value = false
  }
  catch (e: any) {
    artEditError.value = e?.data?.statusMessage ?? 'Could not save'
  }
  finally {
    artEditBusy.value = false
  }
}

async function moderate(c: QueueItem, status: 'published' | 'hidden') {
  busy.value = c.id
  try { await $fetch(`/api/art/contributions/${c.id}`, { method: 'PATCH', body: { status } }); await refreshQueue(); await refreshAudit() }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not moderate' }
  finally { busy.value = '' }
}

async function decideClaim(c: ClaimItem, status: 'approved' | 'rejected') {
  busy.value = c.id
  try { await $fetch(`/api/admin/claims/${c.id}`, { method: 'PATCH', body: { status } }); await Promise.all([refreshClaims(), refreshContent(), refreshAudit(), refreshMe()]) }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not update claim' }
  finally { busy.value = '' }
}

// Keep the Online view live: re-tick "now" so the dots/labels update, and
// re-poll the presence list while that tab is open.
onMounted(() => {
  const tick = setInterval(() => { nowTick.value = Date.now() }, 15_000)
  const poll = setInterval(() => { if (isAdmin.value && tab.value === 'online') refreshOnline() }, 30_000)
  onBeforeUnmount(() => { clearInterval(tick); clearInterval(poll) })
})

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
      <!-- tab bar -->
      <div class="mt-6 flex flex-wrap gap-1 border-b border-(--ui-border) pb-2">
        <UButton
          v-for="t in tabs"
          :key="t.key"
          :color="tab === t.key ? 'primary' : 'neutral'"
          :variant="tab === t.key ? 'solid' : 'ghost'"
          size="xs"
          @click="tab = t.key"
        >
          {{ t.label }}<span v-if="t.n" class="ml-1 opacity-70">{{ t.n }}</span>
        </UButton>
      </div>
      <p v-if="msg" class="mt-2 text-xs text-(--ui-text-muted)">{{ msg }}</p>

      <!-- QUEUE -->
      <section v-show="tab === 'queue'" class="mt-5">
        <p class="mb-3 text-sm text-(--ui-text-muted)">Art contributions awaiting review.</p>
        <div v-if="queue?.length" class="space-y-2">
          <UCard v-for="c in queue" :key="c.id">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="whitespace-pre-line text-sm">{{ c.body }}</p>
                <p class="mt-1 text-xs text-(--ui-text-muted)">
                  <NuxtLink v-if="c.artId" :to="`/art/${c.artId}`" class="text-primary">{{ c.artName }}</NuxtLink>
                  <span v-else>{{ c.artName }}</span>
                  <span v-if="c.language"> · {{ c.language }}</span> · {{ c.authorName || 'Anonymous' }} · {{ rel(c.createdAt) }}
                </p>
                <a v-if="c.mediaUrl" :href="c.mediaUrl" target="_blank" rel="noopener noreferrer" class="text-xs text-primary underline">attached link ↗</a>
              </div>
              <div class="flex shrink-0 gap-1">
                <UButton size="xs" color="primary" variant="soft" :loading="busy === c.id" @click="moderate(c, 'published')">Approve</UButton>
                <UButton size="xs" color="neutral" variant="ghost" :loading="busy === c.id" @click="moderate(c, 'hidden')">Hide</UButton>
              </div>
            </div>
          </UCard>
        </div>
        <p v-else class="py-10 text-center text-sm text-(--ui-text-muted)">Nothing waiting. 🎉</p>
      </section>

      <!-- CLAIMS -->
      <section v-show="tab === 'claims'" class="mt-5">
        <p class="mb-3 text-sm text-(--ui-text-muted)">Artists requesting to manage an artwork. Approving transfers ownership to them and notifies them.</p>
        <div v-if="claims?.length" class="space-y-2">
          <UCard v-for="c in claims" :key="c.id">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-medium">
                  <NuxtLink v-if="c.artId" :to="`/art/${c.artId}`" class="text-primary">{{ c.artName }}</NuxtLink>
                  <span v-else>{{ c.artName }}</span>
                  <span v-if="c.artArtist" class="text-(--ui-text-muted)"> · by {{ c.artArtist }}</span>
                </p>
                <p class="mt-0.5 text-xs text-(--ui-text-muted)">Claimed by {{ c.claimant }}<span v-if="c.claimantEmail"> · {{ c.claimantEmail }}</span> · {{ rel(c.createdAt) }}</p>
                <p v-if="c.message" class="mt-2 whitespace-pre-line rounded-md bg-(--ui-bg-muted) px-2.5 py-1.5 text-sm">{{ c.message }}</p>
              </div>
              <div class="flex shrink-0 gap-1">
                <UButton size="xs" color="primary" variant="soft" :loading="busy === c.id" @click="decideClaim(c, 'approved')">Approve</UButton>
                <UButton size="xs" color="neutral" variant="ghost" :loading="busy === c.id" @click="decideClaim(c, 'rejected')">Reject</UButton>
              </div>
            </div>
          </UCard>
        </div>
        <p v-else class="py-10 text-center text-sm text-(--ui-text-muted)">No pending claims. 🎉</p>
      </section>

      <!-- ONLINE (presence) -->
      <section v-show="tab === 'online'" class="mt-5">
        <p class="mb-3 text-sm text-(--ui-text-muted)">
          <span class="font-medium text-(--ui-text)">{{ onlineCount }}</span> online now · {{ (online?.length ?? 0) }} active recently. Updates live.
        </p>
        <div v-if="online?.length" class="divide-y divide-(--ui-border) overflow-hidden rounded-xl border border-(--ui-border)">
          <div v-for="u in online" :key="u.id" class="flex items-center gap-3 px-3 py-2.5">
            <span class="relative flex size-2.5 shrink-0">
              <span v-if="isOnline(u)" class="absolute inline-flex size-full animate-ping rounded-full bg-green-500/60" />
              <span class="inline-flex size-2.5 rounded-full" :class="isOnline(u) ? 'bg-green-500' : 'bg-(--ui-text-dimmed)/40'" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">
                {{ u.displayName || u.email }}
                <UBadge v-if="u.role !== 'user'" color="neutral" variant="subtle" size="xs" class="ml-1">{{ roleLabel(u.role) }}</UBadge>
                <UBadge v-if="u.id === myId" color="primary" variant="subtle" size="xs" class="ml-1">you</UBadge>
              </p>
              <p v-if="u.displayName" class="truncate text-xs text-(--ui-text-muted)">{{ u.email }}</p>
            </div>
            <span class="shrink-0 text-xs" :class="isOnline(u) ? 'text-green-600 dark:text-green-400' : 'text-(--ui-text-muted)'">
              {{ isOnline(u) ? 'online' : (u.lastSeenAt ? rel(u.lastSeenAt) : '—') }}
            </span>
          </div>
        </div>
        <p v-else class="py-10 text-center text-sm text-(--ui-text-muted)">No activity yet.</p>
      </section>

      <!-- PEOPLE (roles + features) -->
      <section v-show="tab === 'people'" class="mt-5">
        <UInput v-model="q" icon="i-lucide-search" placeholder="Search by email or name…" class="mb-3 w-full" />
        <div class="divide-y divide-(--ui-border) overflow-hidden rounded-xl border border-(--ui-border)">
          <div v-for="u in filteredUsers" :key="u.id" class="px-3 py-2.5">
            <div class="flex items-center gap-3">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ u.displayName || '—' }}<UBadge v-if="u.id === myId" color="primary" variant="subtle" size="xs" class="ml-1">you</UBadge></p>
                <p class="truncate text-xs text-(--ui-text-muted)">{{ u.email }}</p>
              </div>
              <USelect :model-value="u.role" :items="roleItems" :disabled="u.id === myId || busy === u.id" size="sm" class="w-40" @update:model-value="(r:string) => setRole(u, r)" />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <span class="text-xs text-(--ui-text-muted)">Features:</span>
              <UButton
                v-for="f in FEATURES"
                :key="f.key"
                :color="u.features.includes(f.key) ? 'primary' : 'neutral'"
                :variant="u.features.includes(f.key) ? 'soft' : 'outline'"
                size="xs"
                :loading="busy === u.id"
                :title="f.description"
                @click="toggleFeature(u, f.key)"
              >
                {{ f.label }}
              </UButton>
            </div>
          </div>
          <p v-if="!filteredUsers.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">No users match.</p>
        </div>
      </section>

      <!-- CONTENT -->
      <section v-show="tab === 'content'" class="mt-5">
        <div class="mb-3 flex gap-1">
          <UButton v-for="t in (['camps', 'art', 'events'] as const)" :key="t" :color="ctab === t ? 'primary' : 'neutral'" :variant="ctab === t ? 'solid' : 'ghost'" size="xs" class="capitalize" @click="ctab = t">
            {{ t }} ({{ content?.[t]?.length ?? 0 }})
          </UButton>
        </div>
        <div class="divide-y divide-(--ui-border) overflow-hidden rounded-xl border border-(--ui-border)">
          <template v-if="ctab === 'camps'">
            <div v-for="c in content?.camps" :key="c.id" class="flex flex-wrap items-center gap-2 px-3 py-2" :class="c.hidden && 'opacity-55'">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ c.name }} <span class="text-(--ui-text-muted)">· {{ c.year }}</span><UBadge v-if="c.hidden" color="neutral" variant="subtle" size="xs" class="ml-1">hidden</UBadge></p>
                <p class="truncate text-xs text-(--ui-text-muted)">{{ c.owner ?? 'no owner' }} · 📍 {{ c.address ?? 'no location' }}</p>
              </div>
              <UButton variant="ghost" size="xs" icon="i-lucide-pencil" @click="openCampEdit(c)">Edit</UButton>
              <UButton :to="`/?adminCamp=${c.id}`" variant="ghost" size="xs" icon="i-lucide-map-pin">Place</UButton>
              <UButton v-if="c.address" :to="`/?editCamp=${c.id}`" variant="ghost" size="xs" icon="i-lucide-frame">Boundary</UButton>
              <UButton :color="c.hidden ? 'primary' : 'neutral'" variant="ghost" size="xs" :icon="c.hidden ? 'i-lucide-eye' : 'i-lucide-eye-off'" :loading="busy === c.id" @click="toggleHidden('camps', c.id, !c.hidden)">{{ c.hidden ? 'Show' : 'Hide' }}</UButton>
              <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" :loading="busy === c.id" @click="del('camps', c.id, c.name)">Delete</UButton>
            </div>
            <p v-if="!content?.camps?.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">No camps.</p>
          </template>
          <template v-else-if="ctab === 'art'">
            <div v-for="a in content?.art" :key="a.id" class="flex items-center gap-3 px-3 py-2" :class="a.hidden && 'opacity-55'">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ a.name }} <span class="text-(--ui-text-muted)">· {{ a.year }}</span><UBadge v-if="a.hidden" color="neutral" variant="subtle" size="xs" class="ml-1">hidden</UBadge></p>
                <p class="truncate text-xs text-(--ui-text-muted)">{{ a.owner ?? 'no owner' }} · {{ a.contributions }} contribution(s)<span v-if="a.pending"> · {{ a.pending }} pending</span></p>
              </div>
              <UButton variant="ghost" size="xs" icon="i-lucide-pencil" @click="openArtEdit(a)">Edit</UButton>
              <UButton :to="`/art/${a.id}`" variant="ghost" size="xs" icon="i-lucide-external-link">Open</UButton>
              <UButton v-if="a.owner" color="primary" variant="ghost" size="xs" icon="i-lucide-tent" :loading="busy === a.id" @click="convertToCamp(a.id, a.name)">→ Camp</UButton>
              <UButton :color="a.hidden ? 'primary' : 'neutral'" variant="ghost" size="xs" :icon="a.hidden ? 'i-lucide-eye' : 'i-lucide-eye-off'" :loading="busy === a.id" @click="toggleHidden('art', a.id, !a.hidden)">{{ a.hidden ? 'Show' : 'Hide' }}</UButton>
              <UButton color="error" variant="ghost" size="xs" icon="i-lucide-trash-2" :loading="busy === a.id" @click="del('art', a.id, a.name)">Delete</UButton>
            </div>
            <p v-if="!content?.art?.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">No art.</p>
          </template>
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

      <!-- RECENT -->
      <section v-show="tab === 'recent'" class="mt-5">
        <p class="mb-3 text-sm text-(--ui-text-muted)">Newest submissions across the site.</p>
        <ul class="divide-y divide-(--ui-border) overflow-hidden rounded-xl border border-(--ui-border)">
          <li v-for="r in recent" :key="r.type + r.id" class="flex items-center gap-2 px-3 py-2 text-sm">
            <UBadge color="neutral" variant="subtle" size="xs" class="w-24 justify-center capitalize">{{ r.type }}</UBadge>
            <span class="min-w-0 flex-1 truncate">{{ r.label }}</span>
            <span class="shrink-0 text-xs text-(--ui-text-muted)">{{ rel(r.createdAt) }}</span>
          </li>
          <li v-if="!recent?.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">Nothing yet.</li>
        </ul>
      </section>

      <!-- AUDIT -->
      <section v-show="tab === 'audit'" class="mt-5">
        <p class="mb-3 text-sm text-(--ui-text-muted)">Who did what.</p>
        <ul class="divide-y divide-(--ui-border) overflow-hidden rounded-xl border border-(--ui-border)">
          <li v-for="a in auditRows" :key="a.id" class="flex items-center gap-2 px-3 py-2 text-sm">
            <code class="shrink-0 rounded bg-(--ui-bg-muted) px-1.5 py-0.5 text-xs">{{ a.action }}</code>
            <span class="min-w-0 flex-1 truncate text-(--ui-text-muted)">{{ a.actor }}<span v-if="a.detail"> · {{ a.detail }}</span></span>
            <span class="shrink-0 text-xs text-(--ui-text-muted)">{{ rel(a.createdAt) }}</span>
          </li>
          <li v-if="!auditRows?.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">No activity logged yet.</li>
        </ul>
      </section>
    </template>

    <!-- edit camp details (admin) -->
    <UModal v-model:open="campEditOpen" title="Edit camp">
      <template #body>
        <form class="space-y-3" @submit.prevent="saveCampEdit">
          <UInput v-model="campForm.name" placeholder="Camp name" class="w-full" />
          <UTextarea v-model="campForm.description" :rows="3" autoresize placeholder="Description" class="w-full" />
          <UInput v-model="campForm.website" type="url" placeholder="Website — https://…" icon="i-lucide-link" class="w-full" />
          <div class="grid grid-cols-2 gap-2">
            <UInput v-model="campForm.hometown" placeholder="Hometown" class="w-full" />
            <UInput v-model="campForm.contactEmail" type="email" placeholder="Contact email" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <UInput v-model.number="campForm.frontageFt" type="number" min="0" placeholder="Frontage (ft)" class="w-full" />
            <UInput v-model.number="campForm.depthFt" type="number" min="0" placeholder="Depth (ft)" class="w-full" />
          </div>
          <p class="text-xs text-(--ui-text-muted)">Tip: use “Boundary” to drag the pin &amp; resize the plot live on the map.</p>
          <p v-if="campEditError" class="text-sm text-red-600">{{ campEditError }}</p>
          <UButton type="submit" block :loading="campEditBusy" :disabled="!campForm.name.trim()">Save details</UButton>
        </form>

        <div class="mt-4 border-t border-(--ui-border) pt-4">
          <p class="mb-1 text-xs font-medium text-(--ui-text)">Owner</p>
          <p class="mb-2 text-xs text-(--ui-text-muted)">The account that manages this camp — they can edit it and post its events.</p>
          <div class="flex gap-2">
            <UInput v-model="campOwnerEmail" type="email" placeholder="owner@email.com" icon="i-lucide-user" class="flex-1" @keydown.enter.prevent="assignCampOwner" />
            <UButton :loading="campOwnerBusy" :disabled="!campOwnerEmail.trim()" color="neutral" variant="soft" @click="assignCampOwner">Assign</UButton>
          </div>
          <p v-if="campOwnerMsg" class="mt-1.5 text-xs" :class="campOwnerMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'">{{ campOwnerMsg }}</p>
        </div>
      </template>
    </UModal>

    <!-- edit art details (admin) -->
    <UModal v-model:open="artEditOpen" title="Edit art">
      <template #body>
        <form class="space-y-3" @submit.prevent="saveArtEdit">
          <UInput v-model="artForm.name" placeholder="Artwork name" class="w-full" />
          <div class="grid grid-cols-2 gap-2">
            <UInput v-model="artForm.artist" placeholder="Artist" class="w-full" />
            <UInput v-model.number="artForm.year" type="number" min="1986" placeholder="Year" class="w-full" />
          </div>
          <UTextarea v-model="artForm.description" :rows="3" autoresize placeholder="Description" class="w-full" />
          <UInput v-model="artForm.website" type="url" placeholder="Website — https://…" icon="i-lucide-link" class="w-full" />
          <div class="grid grid-cols-2 gap-2">
            <UInput v-model="artForm.hometown" placeholder="Hometown" class="w-full" />
            <UInput v-model="artForm.contactEmail" type="email" placeholder="Contact email" class="w-full" />
          </div>
          <p v-if="artEditError" class="text-sm text-red-600">{{ artEditError }}</p>
          <UButton type="submit" block :loading="artEditBusy" :disabled="!artForm.name.trim()">Save details</UButton>
        </form>
      </template>
    </UModal>
  </UContainer>
</template>
