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
interface OnlineUser { id: string, email: string, displayName: string | null, role: string, lastSeenAt: string | null }
interface Recent { type: string, id: string, label: string, createdAt: string }
interface Audit { id: string, action: string, actor: string, targetType: string | null, targetId: string | null, detail: string | null, createdAt: string }

const { loggedIn } = useUserSession()
const { me, isAdmin } = useMe()
const myId = computed(() => me.value?.id)

const { data: users, refresh: refreshUsers } = await useFetch<AdminUser[]>('/api/admin/users', { immediate: false, default: () => [] })
const { data: content, refresh: refreshContent } = await useFetch<Content>('/api/admin/content', { immediate: false, default: () => ({ camps: [], art: [], events: [] }) })
const { data: online, refresh: refreshOnline } = await useFetch<OnlineUser[]>('/api/admin/online', { immediate: false, default: () => [] })
interface Usage { available: boolean, activeNow: number, last24h: number, hours: { at: number, n: number }[], topPaths: { path: string, n: number }[] }
const { data: usage, refresh: refreshUsage } = await useFetch<Usage>('/api/admin/usage', { immediate: false, default: () => ({ available: false, activeNow: 0, last24h: 0, hours: [], topPaths: [] }) })
const { data: recent, refresh: refreshRecent } = await useFetch<Recent[]>('/api/admin/recent', { immediate: false, default: () => [] })
const { data: auditRows, refresh: refreshAudit } = await useFetch<Audit[]>('/api/admin/audit', { immediate: false, default: () => [] })
watch(isAdmin, (v) => {
  if (v) {
    refreshUsers()
    refreshContent()
    refreshOnline()
    refreshUsage()
    refreshRecent()
    refreshAudit()
  }
}, { immediate: true })

// "Online" = active within the last 5 minutes (a few missed 60s heartbeats).
const ONLINE_MS = 5 * 60 * 1000
const nowTick = ref(Date.now())
const isOnline = (u: OnlineUser) => !!u.lastSeenAt && nowTick.value - +new Date(u.lastSeenAt) < ONLINE_MS
const onlineCount = computed(() => (online.value ?? []).filter(isOnline).length)

// --- Local weather stations -------------------------------------------------
// Stations arrive mid-event, so they live in the database and are added here by
// the vendor's own id rather than by editing code and waiting for a deploy.
interface WxStation {
  id: string
  vendor: string
  stationId: string
  label: string | null
  owner: string | null
  active: boolean
  lat: number | null
  lng: number | null
  lastSeenAt: string | null
  note: string | null
}
const { data: stations, refresh: refreshStations } = await useFetch<WxStation[]>(
  '/api/admin/weather/stations',
  { default: () => [] },
)
// Which providers have a key. Asked up front so the panel can say "no key yet"
// rather than letting someone type an ID and read a vague failure.
const { data: wxStatus } = await useFetch<{ wunderground: boolean, tempest: boolean }>(
  '/api/admin/weather/status',
  { default: () => ({ wunderground: false, tempest: false }) },
)
const wxForm = reactive({ stationId: '', label: '', owner: '', note: '' })
const wxBusy = ref(false)
const wxMsg = ref('')
const wxErr = ref('')

async function addStation(allowFarAway = false) {
  const id = wxForm.stationId.trim()
  if (!id)
    return
  wxBusy.value = true
  wxErr.value = ''
  wxMsg.value = ''
  try {
    const r = await $fetch<any>('/api/admin/weather/stations', {
      method: 'POST',
      body: {
        vendor: 'wunderground',
        stationId: id,
        label: wxForm.label.trim() || undefined,
        owner: wxForm.owner.trim() || undefined,
        note: wxForm.note.trim() || undefined,
        allowFarAway,
      },
    })
    wxMsg.value = `Added ${r.label} — ${r.km} km from the city, reading ${r.reading?.tempF ?? '?'}°F.`
    wxForm.stationId = ''
    wxForm.label = ''
    wxForm.owner = ''
    wxForm.note = ''
    await refreshStations()
  }
  catch (e: any) {
    // Show what the server actually said. The previous fallback swallowed a
    // perfectly clear "no API key configured" and left an admin guessing.
    const code = e?.data?.statusCode ?? e?.statusCode
    const said = e?.data?.statusMessage || e?.data?.message || e?.message
    wxErr.value = said
      ? (code ? `${said} (${code})` : said)
      : `Could not reach the server (${code ?? 'no response'}).`
  }
  finally {
    wxBusy.value = false
  }
}

async function removeStation(s: WxStation) {
  // eslint-disable-next-line no-alert
  if (!window.confirm(`Remove ${s.label || s.stationId}?`))
    return
  try {
    await $fetch(`/api/admin/weather/stations?id=${s.id}`, { method: 'DELETE' })
    await refreshStations()
  }
  catch (e: any) {
    wxErr.value = e?.data?.statusMessage ?? 'Could not remove that station.'
  }
}

const tabs = computed(() => [
  { key: 'online', label: 'Online', n: onlineCount.value },
  { key: 'people', label: 'People', n: users.value?.length ?? 0 },
  { key: 'content', label: 'Content', n: undefined },
  { key: 'recent', label: 'Recent', n: undefined },
  { key: 'audit', label: 'Audit', n: undefined },
  { key: 'weather', label: 'Weather', n: stations.value?.length ?? undefined },
  { key: 'broadcast', label: 'Broadcast', n: undefined },
] as const)
type Tab = 'online' | 'people' | 'content' | 'recent' | 'audit' | 'weather' | 'broadcast'
const route = useRoute()
const validTabs: Tab[] = ['online', 'people', 'content', 'recent', 'audit', 'weather', 'broadcast']
const tab = ref<Tab>(validTabs.includes(route.query.tab as Tab) ? (route.query.tab as Tab) : 'online')
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

// Keep the Online view live: re-tick "now" so the dots/labels update, and
// re-poll the presence list while that tab is open.
onMounted(() => {
  const tick = setInterval(() => { nowTick.value = Date.now() }, 15_000)
  const poll = setInterval(() => { if (isAdmin.value && tab.value === 'online') refreshOnline() }, 30_000)
  const pulse = setInterval(() => { if (isAdmin.value) refreshUsage() }, 60_000)
  onBeforeUnmount(() => { clearInterval(tick); clearInterval(poll); clearInterval(pulse) })
})

// --- Broadcast email to all users (prefilled with the current announcement) ---
const bcSubject = ref('Two weeks out: a much more accurate map, and one question for you')
const bcBody = ref(`Gate opens in two weeks. Here is what has changed on brcmap.net since the rename.

FIRE AND SMOKE

There are wildfires burning in the region right now, so the Live page has a new section for them: official National Weather Service alerts word for word, active fires with their distance and direction from the Man, size and containment, and the current air quality at the city.

We are not an emergency service and nothing on that page decides whether anywhere is evacuated. It links straight to Nevada Emergency Management, Washoe County, InciWeb and the AirNow Fire and Smoke Map, and those are the ones to trust if you are driving in.

https://brcmap.net/live

THE MAP IS NOW THE REAL CITY

The city used to be drawn from maths: perfect circles, evenly spaced radials, a Center Camp fitted by eye. It is now Burning Man's own surveyed GIS. Real block shapes, streets split at their true intersections, and two plazas at 2:00 and 10:00 that we had never drawn at all.

Center Camp is traced from the official plan's own ink rather than approximated, so the dome, the V walkway and the cafe read the way they do on the printed map.

Your camp pin has not moved. Addresses are computed the same way they always were.

EMERGENCY SERVICES

A Ranger wrote in to say our medical and Ranger pins at 3:00 and 9:00 were on the wrong street. They were, by a full block. Medical, the Ranger outposts and Rampart now sit on exact surveyed coordinates, and medical draws as the official BRC Emergency Services badge instead of a red dot that looked like every other camp.

Eighteen other landmarks moved to their surveyed positions, the Temple by 158 metres. The gate complex is on the map for the first time: Box Office, Will Call, D Lot, Gate Actual, the Census checkpoint and Walk-In Camp.

Porta-potties are on by default now, and they look like porta-potties.

FINDING PEOPLE WITHOUT SERVICE

BRC Map now joins Burntastic, the citywide Meshtastic mesh, on the same settings the event's own radios use. Bring a LoRa radio and your position rides the mesh with everyone else's, no cell service required.

The GPS readout also got more useful. It tells you which side of the street you are on, names both streets when you are mid-block, and names the camp you are standing next to.

ONE QUESTION FOR YOU

We are working with the Burntastic folks on the Meshtastic side, and they have asked to include our map data in the official Meshtastic app, so a burner with a radio and no signal can still look up where a camp is.

We would like to say yes. Here is exactly what would travel: the camp and art names, addresses and pins that are already public on brcmap.net. Nothing tied to your account goes with it. No email addresses, no account details, no live GPS positions. Only what any visitor to the map can already see.

Your camp is included by default. If you would rather it stayed out, reply to this email and say so and we will exclude it before we send anything. You do not need to give a reason.

THE LIVE PAGE

- Temperatures and wind now show in Celsius and km/h alongside Fahrenheit and mph
- Two more playa stations added to the radio list: The K-Hole 102.3 FM and Shouting Fire 99.5 FM, next to BMIR and GARS
- The Wave added to the burn schedule, Wednesday 2 September at 11:01 PM

CAMPS AND ART

- Tap a camp pin and you now get the camp itself: what they do, where they are from, and a link to their site
- Draw your camp's real footprint by hand on the map, and set its height, so the Sun and Shade tool casts a shadow that matches your actual build
- Artists can edit their own artwork listings
- Fixed the crash some of you hit opening the map inside the Facebook app

Found something wrong? Reply to this email. The Ranger who wrote in about the medical stations moved four pins and found a real bug, and that is worth more than any amount of us staring at the code.

See you out there.

digit
https://brcmap.net`)
const bcBusy = ref<'self' | 'all' | ''>('')
const bcResult = ref('')
const bcOk = ref(false)
const recipientCount = computed(() => new Set((users.value ?? []).map(u => u.email).filter(Boolean)).size)

async function sendBroadcast(target: 'self' | 'all') {
  if (!bcSubject.value.trim() || !bcBody.value.trim())
    return
  if (target === 'all') {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Send this email to all ${recipientCount.value} registered users? This can't be undone.`))
      return
  }
  bcBusy.value = target
  bcResult.value = ''
  try {
    const r = await $fetch<{ total: number, sent: number, failed: number }>('/api/admin/broadcast', { method: 'POST', body: { subject: bcSubject.value, body: bcBody.value, target } })
    bcOk.value = r.failed === 0
    bcResult.value = `${target === 'self' ? 'Test' : 'Broadcast'}: ${r.sent}/${r.total} sent${r.failed ? ` · ${r.failed} failed (SMTP may be blocked)` : ''}.`
    await refreshAudit()
  }
  catch (e: any) {
    bcOk.value = false
    bcResult.value = e?.data?.statusMessage ?? 'Send failed'
  }
  finally {
    bcBusy.value = ''
  }
}

useHead({ title: 'Admin — BRC Map' })
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
      <!-- Anyone out there? Deliberately one quiet line rather than a
           dashboard: it is the first thing you want to know and the least
           important thing to look at. -->
      <div v-if="usage?.available" class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--ui-text-muted)">
        <span class="flex items-center gap-1.5">
          <span class="relative flex size-2">
            <span v-if="usage.activeNow" class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span class="relative inline-flex size-2 rounded-full" :class="usage.activeNow ? 'bg-emerald-500' : 'bg-(--ui-text-muted)/40'" />
          </span>
          <span class="font-medium text-(--ui-text)">{{ usage.activeNow }}</span>
          on the map now
        </span>
        <span class="text-(--ui-text-muted)/50">·</span>
        <span><span class="font-medium text-(--ui-text)">{{ usage.last24h }}</span> in the last 24h</span>
        <!-- 24 bars, one an hour, oldest left. Enough to see a shape. -->
        <span class="flex h-4 items-end gap-px" :title="usage.hours.map(h => `${new Date(h.at).getHours()}:00 — ${h.n}`).join('\n')">
          <span
            v-for="h in usage.hours" :key="h.at"
            class="w-1 rounded-t-sm bg-primary/70"
            :style="{ height: `${Math.max(2, (h.n / Math.max(1, ...usage.hours.map(x => x.n))) * 16)}px` }"
          />
        </span>
        <span v-if="usage.topPaths.length" class="text-(--ui-text-muted)/70">
          busiest: {{ usage.topPaths.slice(0, 3).map(p => `${p.path} (${p.n})`).join(' · ') }}
        </span>
      </div>
      <p v-if="msg" class="mt-2 text-xs text-(--ui-text-muted)">{{ msg }}</p>

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

      <!-- WEATHER STATIONS -->
      <section v-show="tab === 'weather'" class="mt-5">
        <p class="mb-3 text-sm text-(--ui-text-muted)">
          Local stations feeding the Live page. Add one by its Weather Underground station ID —
          the call sign on its dashboard, like <code class="rounded bg-(--ui-bg-muted) px-1">KNVGERLA2</code>.
          The ID is checked before it is saved, and the position comes from the station itself.
        </p>

        <div v-if="!wxStatus?.wunderground" class="mb-4 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-sm">
          <UIcon name="i-lucide-key-round" class="mt-0.5 size-4 shrink-0 text-amber-500" />
          <p class="text-(--ui-text-toned)">
            <b class="text-(--ui-text)">No Weather Underground key yet.</b>
            Stations cannot be added until <code class="rounded bg-(--ui-bg-muted) px-1">WU_API_KEY</code>
            is set in the app environment. A free key comes with any Weather Underground PWS account.
          </p>
        </div>

        <form class="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" @submit.prevent="addStation(false)">
          <UInput v-model="wxForm.stationId" placeholder="Station ID (e.g. KNVGERLA2)" required />
          <UInput v-model="wxForm.label" placeholder="Name shown on the map (optional)" />
          <UInput v-model="wxForm.owner" placeholder="Who brought it (optional)" />
          <UButton type="submit" :loading="wxBusy" :disabled="!wxStatus?.wunderground" icon="i-lucide-plus">Add</UButton>
        </form>

        <p v-if="wxMsg" class="mb-3 rounded-lg bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">{{ wxMsg }}</p>
        <div v-if="wxErr" class="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {{ wxErr }}
          <!-- a station in transit is a legitimate case, so offer it explicitly -->
          <UButton
            v-if="wxErr.includes('km from Black Rock City')"
            size="xs"
            variant="soft"
            color="neutral"
            class="ml-2"
            @click="addStation(true)"
          >
            Add anyway
          </UButton>
        </div>

        <ul class="divide-y divide-(--ui-border) rounded-xl border border-(--ui-border)">
          <li v-for="st in stations" :key="st.id" class="flex items-start justify-between gap-3 px-3 py-2.5">
            <div class="min-w-0">
              <p class="font-medium">
                {{ st.label || st.stationId }}
                <UBadge size="xs" variant="subtle" color="neutral" class="ml-1">{{ st.stationId }}</UBadge>
                <UBadge v-if="!st.active" size="xs" variant="subtle" color="warning" class="ml-1">off</UBadge>
              </p>
              <p class="text-xs text-(--ui-text-muted)">
                <span v-if="st.owner">{{ st.owner }} · </span>
                <span v-if="st.lat != null">{{ st.lat.toFixed(4) }}, {{ st.lng!.toFixed(4) }}</span>
                <span v-else>position unknown</span>
                <span v-if="st.lastSeenAt"> · last seen {{ new Date(st.lastSeenAt).toLocaleString() }}</span>
              </p>
              <p v-if="st.note" class="text-xs text-(--ui-text-muted)">{{ st.note }}</p>
            </div>
            <UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" :aria-label="`Remove ${st.label || st.stationId}`" @click="removeStation(st)" />
          </li>
          <li v-if="!stations?.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">
            No stations yet. Add one above and it appears on the Live page.
          </li>
        </ul>
      </section>

      <!-- BROADCAST -->
      <section v-show="tab === 'broadcast'" class="mt-5">
        <p class="mb-3 text-sm text-(--ui-text-muted)">
          Email every registered user. Each person gets their own copy (addresses stay private). Plain text —
          blank lines start new paragraphs and lines beginning with “- ” become bullets.
        </p>
        <div class="space-y-3 rounded-xl border border-(--ui-border) p-4">
          <UInput v-model="bcSubject" placeholder="Subject" class="w-full" />
          <UTextarea v-model="bcBody" :rows="14" autoresize placeholder="Message…" class="w-full" />
          <div class="flex flex-wrap items-center gap-2">
            <UButton :loading="bcBusy === 'self'" :disabled="!!bcBusy || !bcSubject.trim() || !bcBody.trim()" color="neutral" variant="soft" icon="i-lucide-send" @click="sendBroadcast('self')">
              Send test to me
            </UButton>
            <UButton :loading="bcBusy === 'all'" :disabled="!!bcBusy || !bcSubject.trim() || !bcBody.trim() || !recipientCount" color="primary" icon="i-lucide-megaphone" @click="sendBroadcast('all')">
              Send to all ({{ recipientCount }})
            </UButton>
            <span v-if="bcResult" class="text-sm" :class="bcOk ? 'text-green-600' : 'text-red-600'">{{ bcResult }}</span>
          </div>
          <p class="text-xs text-(--ui-text-muted)">
            Tip: always “Send test to me” first — it confirms the copy and that the server can send (DigitalOcean can block outbound SMTP) before you hit the whole list.
          </p>
        </div>
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
