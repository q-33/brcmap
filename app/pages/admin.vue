<script setup lang="ts">
import { FEATURES } from '~~/lib/features'
import { ROLES } from '~~/lib/roles'

interface AdminUser { id: string, email: string, displayName: string | null, role: string, createdAt: string, features: string[] }
interface AdminCamp {
  id: string, name: string, year: number, owner: string | null, locations: number, hidden: boolean
  description: string | null, website: string | null, contactEmail: string | null, hometown: string | null
  frontageFt: number | null, depthFt: number | null, lat: number | null, lng: number | null, address: string | null
}
interface Content {
  camps: AdminCamp[]
  art: { id: string, name: string, year: number, owner: string | null, locations: number, contributions: number, pending: number, hidden: boolean }[]
  events: { id: string, title: string, camp: string | null, startsAt: string }[]
}
interface QueueItem { id: string, body: string, language: string | null, mediaUrl: string | null, authorName: string | null, createdAt: string, artId: string | null, artName: string }
interface ClaimItem { id: string, message: string | null, createdAt: string, artId: string | null, artName: string, artArtist: string | null, claimant: string, claimantEmail: string | null }
interface Report { id: string, contentType: string, contentId: string, contentName: string, reason: string | null, status: string, reporter: string | null, createdAt: string }
interface Recent { type: string, id: string, label: string, createdAt: string }
interface Audit { id: string, action: string, actor: string, targetType: string | null, targetId: string | null, detail: string | null, createdAt: string }

const { loggedIn } = useUserSession()
const { me, isAdmin, refreshMe } = useMe()
const myId = computed(() => me.value?.id)

const { data: users, refresh: refreshUsers } = await useFetch<AdminUser[]>('/api/admin/users', { immediate: false, default: () => [] })
const { data: content, refresh: refreshContent } = await useFetch<Content>('/api/admin/content', { immediate: false, default: () => ({ camps: [], art: [], events: [] }) })
const { data: queue, refresh: refreshQueue } = await useFetch<QueueItem[]>('/api/admin/contributions', { immediate: false, default: () => [] })
const { data: claims, refresh: refreshClaims } = await useFetch<ClaimItem[]>('/api/admin/claims', { immediate: false, default: () => [] })
const { data: reports, refresh: refreshReports } = await useFetch<Report[]>('/api/admin/reports', { immediate: false, default: () => [] })
const { data: recent, refresh: refreshRecent } = await useFetch<Recent[]>('/api/admin/recent', { immediate: false, default: () => [] })
const { data: auditRows, refresh: refreshAudit } = await useFetch<Audit[]>('/api/admin/audit', { immediate: false, default: () => [] })
watch(isAdmin, (v) => {
  if (v) {
    refreshUsers()
    refreshContent()
    refreshQueue()
    refreshClaims()
    refreshReports()
    refreshRecent()
    refreshAudit()
  }
}, { immediate: true })

const openReports = computed(() => (reports.value ?? []).filter(r => r.status === 'open'))
const tabs = computed(() => [
  { key: 'queue', label: 'Queue', n: queue.value?.length ?? 0 },
  { key: 'claims', label: 'Claims', n: claims.value?.length ?? 0 },
  { key: 'reports', label: 'Reports', n: openReports.value.length },
  { key: 'people', label: 'People', n: users.value?.length ?? 0 },
  { key: 'content', label: 'Content', n: undefined },
  { key: 'recent', label: 'Recent', n: undefined },
  { key: 'audit', label: 'Audit', n: undefined },
] as const)
type Tab = 'queue' | 'claims' | 'reports' | 'people' | 'content' | 'recent' | 'audit'
const route = useRoute()
const validTabs: Tab[] = ['queue', 'claims', 'reports', 'people', 'content', 'recent', 'audit']
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

async function moderate(c: QueueItem, status: 'published' | 'hidden') {
  busy.value = c.id
  try { await $fetch(`/api/art/contributions/${c.id}`, { method: 'PATCH', body: { status } }); await refreshQueue(); await refreshAudit() }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not moderate' }
  finally { busy.value = '' }
}

async function resolveReport(r: Report, status: 'resolved' | 'dismissed') {
  busy.value = r.id
  try { await $fetch(`/api/admin/reports/${r.id}`, { method: 'PATCH', body: { status } }); await refreshReports(); await refreshAudit() }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not update report' }
  finally { busy.value = '' }
}

async function decideClaim(c: ClaimItem, status: 'approved' | 'rejected') {
  busy.value = c.id
  try { await $fetch(`/api/admin/claims/${c.id}`, { method: 'PATCH', body: { status } }); await Promise.all([refreshClaims(), refreshContent(), refreshAudit(), refreshMe()]) }
  catch (e: any) { msg.value = e?.data?.statusMessage ?? 'Could not update claim' }
  finally { busy.value = '' }
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
                <a v-if="c.mediaUrl" :href="c.mediaUrl" target="_blank" class="text-xs text-primary underline">attached link ↗</a>
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

      <!-- REPORTS -->
      <section v-show="tab === 'reports'" class="mt-5">
        <p class="mb-3 text-sm text-(--ui-text-muted)">User-flagged content.</p>
        <div v-if="reports?.length" class="space-y-2">
          <UCard v-for="r in reports" :key="r.id" :class="r.status !== 'open' && 'opacity-55'">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-sm font-medium capitalize">
                  {{ r.contentType }}:
                  <NuxtLink v-if="r.contentType === 'art'" :to="`/art/${r.contentId}`" class="text-primary">{{ r.contentName }}</NuxtLink>
                  <span v-else>{{ r.contentName }}</span>
                  <UBadge v-if="r.status !== 'open'" size="xs" color="neutral" variant="subtle" class="ml-1">{{ r.status }}</UBadge>
                </p>
                <p v-if="r.reason" class="mt-0.5 text-sm text-(--ui-text-muted)">“{{ r.reason }}”</p>
                <p class="mt-1 text-xs text-(--ui-text-muted)">by {{ r.reporter || 'unknown' }} · {{ rel(r.createdAt) }}</p>
              </div>
              <div v-if="r.status === 'open'" class="flex shrink-0 gap-1">
                <UButton size="xs" color="primary" variant="soft" :loading="busy === r.id" @click="resolveReport(r, 'resolved')">Resolve</UButton>
                <UButton size="xs" color="neutral" variant="ghost" :loading="busy === r.id" @click="resolveReport(r, 'dismissed')">Dismiss</UButton>
              </div>
            </div>
          </UCard>
        </div>
        <p v-else class="py-10 text-center text-sm text-(--ui-text-muted)">No reports.</p>
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
              <UButton :to="`/art/${a.id}`" variant="ghost" size="xs" icon="i-lucide-external-link">Open</UButton>
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
          <p class="text-xs text-(--ui-text-muted)">To move/place the pin, use “Place” on the map.</p>
          <p v-if="campEditError" class="text-sm text-red-600">{{ campEditError }}</p>
          <UButton type="submit" block :loading="campEditBusy" :disabled="!campForm.name.trim()">Save details</UButton>
        </form>
      </template>
    </UModal>
  </UContainer>
</template>
