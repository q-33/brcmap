<script setup lang="ts">
import type { GateStatus } from '~~/lib/gate'
import { CITY_YEAR, describeLatLng, formatAddress, formatAddressNamed, parseAddress } from '~~/lib/brc/geocode'
import { GATE_STATUS_META, gateColor } from '~~/lib/gate'
import { dustRisk, windDir, wmo } from '~~/lib/weather'

function namedAddress(s: string | null | undefined): string {
  if (!s)
    return ''
  const a = parseAddress(s)
  return a ? formatAddressNamed(a) : s
}

interface CampPin { name: string, lat: number, lng: number, address: string }

definePageMeta({ layout: false })

const { loggedIn, user, fetch: refreshSession } = useUserSession()
const { hasFeature, refreshMe, isAdmin, isGpe, canManageCamps, canMultiCamp, unreadMessages, pendingClaims } = useMe()

// account dropdown — quick links to messages + the admin/GPE tools + log out
const userMenu = computed(() => {
  const groups: any[] = [[{ label: user.value?.displayName || user.value?.email || 'Account', type: 'label' as const }]]
  groups.push([{
    label: unreadMessages.value ? `Messages (${unreadMessages.value})` : 'Messages',
    icon: 'i-lucide-mail',
    to: '/messages',
  }])
  const tools: any[] = []
  if (isGpe.value)
    tools.push({ label: 'Gate conditions', icon: 'i-lucide-traffic-cone', to: '/gate' })
  // BM Org can place/move any camp from the Camps list (admins use the dashboard).
  if (canManageCamps.value && !isAdmin.value)
    tools.push({ label: 'Place camps', icon: 'i-lucide-map-pin', to: '/camps' })
  if (isAdmin.value)
    tools.push(
      { label: 'Admin dashboard', icon: 'i-lucide-shield', to: '/admin' },
      { label: 'Review queue', icon: 'i-lucide-inbox', to: { path: '/admin', query: { tab: 'queue' } } },
      { label: pendingClaims.value ? `Art claims (${pendingClaims.value})` : 'Art claims', icon: 'i-lucide-hand', to: { path: '/admin', query: { tab: 'claims' } } },
      { label: 'People & roles', icon: 'i-lucide-users', to: { path: '/admin', query: { tab: 'people' } } },
      { label: 'Audit log', icon: 'i-lucide-scroll-text', to: { path: '/admin', query: { tab: 'audit' } } },
    )
  if (tools.length)
    groups.push(tools)
  groups.push([{ label: 'Log out', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: logout }])
  return groups
})

// top-bar nav — inline on desktop, collapsed into a menu on mobile
const navItems = [[
  { label: 'Camps', icon: 'i-lucide-tent', to: '/camps' },
  { label: 'Art', icon: 'i-lucide-palette', to: '/art' },
  { label: 'Events', icon: 'i-lucide-calendar', to: '/events' },
  { label: 'Guide', icon: 'i-lucide-compass', to: '/guide' },
  { label: 'Contact', icon: 'i-lucide-mail', to: '/contact' },
]]

// optional ?lat&lng to focus a camp from the Camps list, or ?adminCamp=ID to
// place/move that camp (admin only).
const route = useRoute()
const focus = computed(() => {
  if (adminPlaceCamp.value?.lat != null)
    return { lat: adminPlaceCamp.value.lat, lng: adminPlaceCamp.value.lng! }
  const lat = Number(route.query.lat)
  const lng = Number(route.query.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
})

// camps + art -> pins
function toPins(items: any): CampPin[] {
  return (items ?? []).flatMap((c: any) =>
    (c.locations ?? [])
      .filter((l: any) => l.gpsLatitude != null && l.gpsLongitude != null)
      .map((l: any) => ({ name: c.name, lat: l.gpsLatitude, lng: l.gpsLongitude, address: namedAddress(l.addressString), frontageFt: c.frontageFt ?? null, depthFt: c.depthFt ?? null })),
  )
}
// client-only: the map (and its pins) render client-side after hydration anyway,
// so keep the homepage SSR shell independent of the DB — it renders instantly and
// stays resilient if the DB is slow/down, and offline the cached shell needs no
// data. Pins populate reactively once these resolve (PlayaMap watches the props).
const { data: campsData, refresh: refreshCamps } = await useFetch('/api/camps', { server: false, lazy: true, default: () => [] })
const { data: artData, refresh: refreshArt } = await useFetch('/api/art', { server: false, lazy: true, default: () => [] })
const pins = computed<CampPin[]>(() => toPins(campsData.value))
const artPins = computed<CampPin[]>(() => toPins(artData.value))

// Live Meshtastic peers (LoRa mesh) → map dots. Shared singleton state, also
// driven by <MeshControl>; here we just plot the ones with a position fix.
const { locatedPeers } = useMeshtastic()
const meshPeers = computed(() => locatedPeers.value.map(n => ({
  num: n.num,
  lat: n.lat!,
  lng: n.lng!,
  label: n.shortName || n.longName || `!${n.num.toString(16)}`,
  isSelf: n.isSelf,
})))

// --- admin: place/move any camp from the map (deep-linked from /admin) -------
const adminPlaceSaved = ref(false)
const adminPlaceCamp = computed(() => {
  const id = route.query.adminCamp
  if (typeof id !== 'string' || !canManageCamps.value)
    return null
  const c = (campsData.value as any[] | null)?.find(x => x.id === id)
  if (!c)
    return null
  const loc = (c.locations ?? []).filter((l: any) => l.gpsLatitude != null)
    .sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
  return { id: c.id, name: c.name as string, lat: (loc?.gpsLatitude ?? null) as number | null, lng: (loc?.gpsLongitude ?? null) as number | null }
})
async function onAdminPlace(p: { lat: number, lng: number }) {
  const c = adminPlaceCamp.value
  if (!c)
    return
  try {
    await $fetch('/api/locations', { method: 'POST', body: { campId: c.id, lat: p.lat, lng: p.lng } })
    await refreshCamps()
    adminPlaceSaved.value = true
  }
  catch { /* surface nothing; the marker stays for a retry */ }
}

// --- live boundary editor: ?editCamp=ID arms an on-map editor (drag the pin +
// two edge handles) for any camp an admin/Org manages, or your own camp. The
// map owns the live geometry; this page renders a readout + Save/Cancel. ---
const DEFAULT_FRONTAGE = 150
const DEFAULT_DEPTH = 100
const mapRef = ref<{ nudgeEdit: (w: 'frontage' | 'depth', d: number) => void } | null>(null)
const editLive = ref<{ lat: number, lng: number, frontageFt: number, depthFt: number } | null>(null)
const editSaving = ref(false)
const toast = useToast()

const editCamp = computed(() => {
  const id = route.query.editCamp
  if (typeof id !== 'string')
    return null
  const c = (campsData.value as any[] | null)?.find(x => x.id === id)
  if (!c)
    return null
  // Boundary editing is open to camp managers (admin/Org) or the camp's owner
  // (any camp they own — Hubs may own several).
  if (!canManageCamps.value && !(myCamps.value ?? []).some(c => c.id === id))
    return null
  const loc = (c.locations ?? []).filter((l: any) => l.gpsLatitude != null && l.gpsLongitude != null)
    .sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
  if (!loc) // a boundary needs a placed pin first
    return null
  return {
    id: c.id,
    name: c.name as string,
    lat: loc.gpsLatitude as number,
    lng: loc.gpsLongitude as number,
    frontageFt: (c.frontageFt ?? DEFAULT_FRONTAGE) as number,
    depthFt: (c.depthFt ?? DEFAULT_DEPTH) as number,
  }
})
// Seed the readout from the camp's stored dims until the map emits live changes.
watch(editCamp, (c) => {
  editLive.value = c ? { lat: c.lat, lng: c.lng, frontageFt: c.frontageFt, depthFt: c.depthFt } : null
}, { immediate: true })
function onEditChange(e: { lat: number, lng: number, frontageFt: number, depthFt: number }) {
  editLive.value = e
}
function exitEdit() {
  const q = { ...route.query }
  delete q.editCamp
  navigateTo({ query: q })
}
async function saveEdit() {
  const c = editCamp.value
  const e = editLive.value
  if (!c || !e)
    return
  editSaving.value = true
  try {
    await $fetch(`/api/camps/${c.id}`, { method: 'PATCH', body: { frontageFt: e.frontageFt, depthFt: e.depthFt } })
    await $fetch('/api/locations', { method: 'POST', body: { campId: c.id, lat: e.lat, lng: e.lng } })
    await refreshCamps()
    toast.add({ title: 'Boundary saved', description: `${c.name}: ${e.frontageFt}×${e.depthFt} ft`, color: 'success', icon: 'i-lucide-check' })
    exitEdit()
  }
  catch (err: any) {
    toast.add({ title: 'Could not save', description: err?.data?.statusMessage ?? 'Try again', color: 'error' })
  }
  finally {
    editSaving.value = false
  }
}

// live Gate Road condition → colour the gate road + a status dot.
// client-only: a non-critical status pill shouldn't block SSR / first paint.
const { data: gateData } = await useFetch<{ inbound: { status: GateStatus } | null }>('/api/gate', { server: false, lazy: true })
const gateRoadColor = computed(() => gateData.value?.inbound ? gateColor(gateData.value.inbound.status) : undefined)
const gateStatusLabel = computed(() => gateData.value?.inbound ? GATE_STATUS_META[gateData.value.inbound.status].label : 'No data')

// live weather → a compact pill (temp + gusts + dust) linking to /live.
// client-only: this proxies an external API (Open-Meteo); never let a slow
// upstream hang SSR / first paint.
const { data: weatherData } = await useFetch<{ current: { temperature_2m: number, weather_code: number, wind_speed_10m: number, wind_gusts_10m: number, wind_direction_10m: number } | null }>('/api/weather', { server: false, lazy: true })
const wx = computed(() => weatherData.value?.current ?? null)

// --- live wind layer: a field of arrows across the playa + a readout ---------
const windMode = ref(false)
const windInfo = computed(() => {
  const c = wx.value
  if (!c || c.wind_direction_10m == null)
    return null
  return { dir: c.wind_direction_10m, speed: c.wind_speed_10m, gusts: c.wind_gusts_10m, ...dustRisk(c.wind_gusts_10m), from: windDir(c.wind_direction_10m) }
})
// passed to the map: null hides the arrows; otherwise direction + dust colour
const windLayer = computed(() => (windMode.value && windInfo.value)
  ? { dir: windInfo.value.dir, gusts: windInfo.value.gusts, color: windInfo.value.color }
  : null)

// map layer visibility (the legend doubles as the toggle control)
// Porta-potties default OFF — the 2026 placement isn't known yet, so we don't
// want to imply the (stale) pins are accurate. Users can re-enable in the legend.
const layers = reactive({ camps: true, art: true, toilets: false, medical: true, safety: true, services: true, transport: true })
const panelOpen = ref(false)
const basemap = ref<'blocks' | 'lines'>('blocks')

// --- sun & shade tool: date + time → shadows for every camp -----------------
const shadowMode = ref(false)
const shadowDate = ref('2026-09-02') // a mid-event day; the burn is Sat Sep 5
const shadowMin = ref(540) // minutes after 06:00 (540 = 3:00 PM)
function shadowClock(min: number) {
  const total = 360 + min
  const h = Math.floor(total / 60)
  const mi = total % 60
  return { h, mi, label: `${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
}
const shadowTimeLabel = computed(() => shadowClock(shadowMin.value).label)
const shadowDayLabel = computed(() => new Date(`${shadowDate.value}T00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))
// instant as epoch ms — BRC runs on PDT (UTC-7) during the event
const sunInstant = computed<number | null>(() => {
  if (!shadowMode.value)
    return null
  const [y, mo, d] = shadowDate.value.split('-').map(Number)
  const { h, mi } = shadowClock(shadowMin.value)
  return Date.UTC(y!, mo! - 1, d!, h + 7, mi)
})

// live GPS readout
const position = ref<{ lat: number, lng: number }>()
const accuracy = ref<number>() // metres, from the GPS fix
const readout = computed(() => position.value ? describeLatLng(position.value) : null)
// A fix worse than this (metres) is too rough to trust the snapped street.
const ACCURACY_WARN_M = 75
const accuracyLabel = computed(() => accuracy.value != null ? `±${Math.round(accuracy.value)} m` : null)
const accuracyRough = computed(() => accuracy.value != null && accuracy.value > ACCURACY_WARN_M)
function onPosition(p: { lat: number, lng: number, accuracy?: number }) {
  position.value = { lat: p.lat, lng: p.lng }
  accuracy.value = p.accuracy
}
// tapping the map (only while a drop is armed) sets the EXACT spot, then opens
// the confirm sheet. Coordinates are stored as-is — never snapped to a street.
function onPick(p: { lat: number, lng: number }) {
  if (adminPlaceCamp.value) {
    onAdminPlace(p)
    return
  }
  if (!dropMode.value)
    return
  pendingLoc.value = { lat: p.lat, lng: p.lng }
  dropOpen.value = true
}

// auth form
const authOpen = ref(false)
const mode = ref<'login' | 'register'>('login')
// open the auth modal when arriving from the header "Log in" (?login=1)
watch(() => route.query.login, (v) => { if (v && !loggedIn.value) authOpen.value = true }, { immediate: true })
const form = reactive({ email: '', password: '', displayName: '' })
const authError = ref('')
const busy = ref(false)

async function submitAuth() {
  busy.value = true
  authError.value = ''
  try {
    const path = mode.value === 'register' ? '/api/auth/register' : '/api/auth/login'
    await $fetch(path, { method: 'POST', body: { ...form } })
    await refreshSession()
    await refreshMe()
    authOpen.value = false
  }
  catch (e: any) {
    authError.value = e?.data?.statusMessage ?? e?.statusMessage ?? 'Something went wrong'
  }
  finally {
    busy.value = false
  }
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await refreshSession()
  await refreshMe()
}

// the current user's own camps + art (for picking vs creating)
type DropKind = 'camp' | 'art'
interface MyItem { id: string, name: string, description?: string | null, website?: string | null, contactEmail?: string | null, hometown?: string | null, frontageFt?: number | null, depthFt?: number | null }
const { data: myCamps, refresh: refreshMineCamps } = await useFetch<MyItem[]>('/api/camps/mine', { immediate: false, default: () => [] })
const { data: myArt, refresh: refreshMineArt } = await useFetch<MyItem[]>('/api/art/mine', { immediate: false, default: () => [] })
watch(loggedIn, (v) => { if (v) { refreshMineCamps(); refreshMineArt() } }, { immediate: true })

// drop pin (camp or art)
const dropOpen = ref(false)
const dropKind = ref<DropKind>('camp')
const selectedId = ref<string>('') // '' = create new
const newName = ref('')
const dropError = ref('')
const dropBusy = ref(false)
// The exact point being placed (from tapping the map). Its label is reverse-
// derived for display ONLY — the coordinates are stored verbatim, never snapped.
const dropMode = ref<DropKind | null>(null)
const pendingLoc = ref<{ lat: number, lng: number } | null>(null)
const pendingLabel = computed(() => pendingLoc.value ? describeLatLng(pendingLoc.value) : null)
const myCamp = computed<MyItem | null>(() => (myCamps.value ?? [])[0] ?? null)

// Manual address entry (gated by the 'manual-address' feature flag): type a BRC
// address instead of tapping — e.g. to mark a spot before arriving (snaps to grid).
const canManualAddress = computed(() => hasFeature('manual-address'))
const manualAddress = ref('')
const manualParsed = computed(() => parseAddress(manualAddress.value.trim()))
const usingManual = computed(() => canManualAddress.value && manualAddress.value.trim() !== '')
const effectiveAddressNamed = computed(() =>
  usingManual.value ? (manualParsed.value ? formatAddressNamed(manualParsed.value) : null) : pendingLabel.value,
)
const hasLocation = computed(() => (usingManual.value && !!manualParsed.value) || !!pendingLoc.value)

const creatingNew = computed(() => selectedId.value === '')
const myItems = computed<MyItem[]>(() => (dropKind.value === 'camp' ? myCamps.value : myArt.value) ?? [])

// Arm placement mode: the user then taps the map to set the spot. For a single-
// camp user who already owns one, this edits (moves) it — you can't make a second.
// Hubs (canMultiCamp) default to creating another camp, like art, and may pick an
// existing camp from the drop sheet to move instead.
async function startDrop(kind: DropKind) {
  dropKind.value = kind
  dropError.value = ''
  pendingLoc.value = null
  manualAddress.value = ''
  if (kind === 'camp') {
    await refreshMineCamps()
    if (canMultiCamp.value) {
      selectedId.value = ''
      newName.value = ''
    }
    else {
      selectedId.value = myCamp.value?.id ?? ''
      newName.value = myCamp.value?.name ?? ''
    }
  }
  else {
    await refreshMineArt()
    selectedId.value = ''
    newName.value = ''
  }
  dropOpen.value = false
  dropMode.value = kind
}

function cancelDrop() {
  dropOpen.value = false
  dropMode.value = null
  pendingLoc.value = null
}

// re-tap to move the pin: keep placement mode armed, just hide the sheet
function movePin() {
  dropOpen.value = false
}

async function dropPin() {
  const useManual = usingManual.value && !!manualParsed.value
  if (!useManual && !pendingLoc.value)
    return
  dropBusy.value = true
  dropError.value = ''
  try {
    let id = selectedId.value
    if (creatingNew.value) {
      const created: any = await $fetch(dropKind.value === 'camp' ? '/api/camps' : '/api/art', {
        method: 'POST',
        body: { name: newName.value, year: CITY_YEAR },
      })
      id = created.id
    }
    const parent = dropKind.value === 'camp' ? { campId: id } : { artId: id }
    const locBody = useManual
      ? { ...parent, addressString: formatAddress(manualParsed.value!) }
      : { ...parent, lat: pendingLoc.value!.lat, lng: pendingLoc.value!.lng }
    await $fetch('/api/locations', { method: 'POST', body: locBody })
    await Promise.all([refreshCamps(), refreshArt(), refreshMineCamps(), refreshMineArt()])
    cancelDrop()
    newName.value = ''
  }
  catch (e: any) {
    dropError.value = e?.data?.statusMessage ?? 'Could not drop pin'
  }
  finally {
    dropBusy.value = false
  }
}

// --- camp details (name / description / website / contact) ------------------
const campEditOpen = ref(false)
// The camp the details sheet is editing. Single-camp users only ever edit their
// one camp; Hubs edit whichever camp they picked in the drop sheet.
const campEditId = ref<string>('')
const campForm = reactive({ name: '', description: '', website: '', hometown: '', contactEmail: '', frontageFt: null as number | null, depthFt: null as number | null })
const campSaveBusy = ref(false)
const campSaveError = ref('')

// The camp currently in focus: the one picked in the drop sheet if it's mine,
// else my (first/only) camp. Lets Hubs edit/move any camp they own.
const currentCamp = computed<MyItem | null>(() =>
  (myCamps.value ?? []).find(c => c.id === selectedId.value) ?? myCamp.value,
)

function openCampEdit(camp: MyItem | null = currentCamp.value) {
  const c = camp
  if (!c)
    return
  campEditId.value = c.id
  campForm.name = c.name ?? ''
  campForm.description = c.description ?? ''
  campForm.website = c.website ?? ''
  campForm.hometown = c.hometown ?? ''
  campForm.contactEmail = c.contactEmail ?? ''
  campForm.frontageFt = c.frontageFt ?? null
  campForm.depthFt = c.depthFt ?? null
  campSaveError.value = ''
  campEditOpen.value = true
}

// From the drop sheet: edit the picked camp's details instead of moving its pin.
function editSelectedCampDetails() {
  const c = currentCamp.value
  cancelDrop()
  openCampEdit(c)
}

async function saveCampDetails() {
  const id = campEditId.value
  if (!id || !campForm.name.trim())
    return
  campSaveBusy.value = true
  campSaveError.value = ''
  try {
    await $fetch(`/api/camps/${id}`, { method: 'PATCH', body: { ...campForm } })
    await Promise.all([refreshMineCamps(), refreshCamps()])
    campEditOpen.value = false
  }
  catch (e: any) {
    campSaveError.value = e?.data?.statusMessage ?? 'Could not save'
  }
  finally {
    campSaveBusy.value = false
  }
}

// jump from the details sheet into placement mode to move this camp's pin
async function moveCampPin() {
  const id = campEditId.value
  campEditOpen.value = false
  await startDrop('camp')
  // Re-target the camp we were editing (startDrop defaults Hubs to create-new).
  if (id)
    selectedId.value = id
}

// jump from the details sheet into the live boundary editor for this camp
function editMyBoundary() {
  if (!campEditId.value)
    return
  campEditOpen.value = false
  navigateTo({ query: { ...route.query, editCamp: campEditId.value } })
}

const itemOptions = computed(() => [
  ...myItems.value.map(c => ({ label: c.name, value: c.id })),
  { label: `+ Create a new ${dropKind.value}`, value: '' },
])
</script>

<template>
  <div class="relative size-full overflow-hidden">
    <div class="absolute inset-0">
      <ClientOnly>
        <PlayaMap ref="mapRef" :camps="pins" :art-pins="artPins" :mesh-peers="meshPeers" :focus="focus" :gate-color="gateRoadColor" :layers="layers" :basemap="basemap" :drop-mode="!!dropMode || !!adminPlaceCamp" :sun-time="sunInstant" :wind="windLayer" :edit-camp="editCamp" class="size-full" @position="onPosition" @pick="onPick" @edit-change="onEditChange" />
      </ClientOnly>
    </div>

    <!-- floating top bar -->
    <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
      <div class="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#26211a]/85 p-1 pl-3 text-white shadow-lg backdrop-blur-xl">
        <NuxtLink to="/" class="mr-1 flex items-center gap-1.5">
          <UIcon name="i-lucide-flame" class="size-4 text-primary" />
          <span class="font-display text-sm font-bold uppercase tracking-wide">BurnerMap</span>
        </NuxtLink>
        <!-- desktop: inline nav -->
        <div class="hidden items-center gap-1 sm:flex">
          <UButton to="/camps" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Camps</UButton>
          <UButton to="/art" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Art</UButton>
          <UButton to="/events" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Events</UButton>
          <UButton to="/guide" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Guide</UButton>
        </div>
        <!-- mobile: collapsed menu -->
        <UDropdownMenu :items="navItems" :content="{ align: 'start', sideOffset: 6 }" class="sm:hidden">
          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-menu" class="text-white/80 hover:text-white" aria-label="Menu" />
        </UDropdownMenu>
      </div>

      <div class="pointer-events-auto flex items-center gap-2">
        <template v-if="loggedIn">
          <!-- Any signed-in user can drop a camp (or edit the one they own). Hubs
               always get "Drop camp" since they may own several. -->
          <UButton size="sm" color="primary" :icon="(myCamp && !canMultiCamp) ? 'i-lucide-pencil' : 'i-lucide-map-pin'" :variant="dropMode === 'camp' ? 'soft' : 'solid'" :aria-label="(myCamp && !canMultiCamp) ? 'Edit my camp' : 'Drop camp'" @click="(myCamp && !canMultiCamp) ? openCampEdit() : startDrop('camp')">
            <span class="hidden sm:inline">{{ (myCamp && !canMultiCamp) ? 'Edit my camp' : 'Drop camp' }}</span>
          </UButton>
          <UButton size="sm" color="neutral" variant="solid" class="bg-[#7c3aed]/85 text-white backdrop-blur-xl" icon="i-lucide-palette" aria-label="Drop art" @click="startDrop('art')">
            <span class="hidden sm:inline">Drop art</span>
          </UButton>
          <UDropdownMenu :items="userMenu" :content="{ align: 'end', sideOffset: 6 }">
            <UButton size="sm" color="neutral" variant="solid" class="bg-[#26211a]/85 text-white backdrop-blur-xl" icon="i-lucide-user" trailing-icon="i-lucide-chevron-down">
              <span class="hidden max-w-28 truncate sm:inline">{{ user?.displayName || 'Account' }}</span>
            </UButton>
          </UDropdownMenu>
        </template>
        <UButton v-else size="sm" color="primary" @click="authOpen = true">
          Log in
        </UButton>
      </div>
    </div>

    <!-- placement banner: shown while a drop is armed, before/between taps -->
    <div v-if="dropMode && !dropOpen" class="pointer-events-auto absolute left-1/2 top-16 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/40 bg-[#26211a]/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
      <UIcon name="i-lucide-hand-pointer" class="size-4 text-primary" />
      <span>Tap the map to place your {{ dropKind }}</span>
      <button type="button" class="text-white/60 underline hover:text-white" @click="cancelDrop">Cancel</button>
    </div>

    <!-- place/move-any-camp banner (from the Camps list "Place on map", or /admin) -->
    <div v-if="adminPlaceCamp" class="pointer-events-auto absolute left-1/2 top-16 z-10 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-primary/40 bg-[#26211a]/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
      <UIcon name="i-lucide-shield" class="size-4 shrink-0 text-primary" />
      <span class="truncate">Tap to {{ adminPlaceCamp.lat != null ? 'move' : 'place' }} <b>{{ adminPlaceCamp.name }}</b></span>
      <span v-if="adminPlaceSaved" class="shrink-0 text-green-400">saved&nbsp;✓</span>
      <NuxtLink :to="isAdmin ? '/admin' : '/camps'" class="shrink-0 text-white/60 underline hover:text-white">Done</NuxtLink>
    </div>

    <!-- live boundary editor: drag the pin + green edge handles on the map; this
         panel mirrors the dimensions and offers precise +/- nudges + Save. -->
    <div v-if="editCamp" class="pointer-events-auto absolute left-1/2 top-16 z-10 flex w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-2.5 rounded-2xl border border-green-500/40 bg-[#26211a]/92 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-xl">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-frame" class="size-4 shrink-0 text-green-400" />
        <span class="min-w-0 flex-1 truncate">Editing boundary · <b>{{ editCamp.name }}</b></span>
        <span class="shrink-0 text-xs text-white/55">drag pin + handles</span>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="flex items-center justify-between gap-1 rounded-lg bg-white/5 px-2 py-1.5">
          <span class="text-xs text-white/60">Frontage</span>
          <div class="flex items-center gap-1">
            <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-minus" :aria-label="'Frontage −10 ft'" @click="mapRef?.nudgeEdit('frontage', -10)" />
            <span class="w-14 text-center font-mono text-xs tabular-nums">{{ editLive?.frontageFt ?? editCamp.frontageFt }} ft</span>
            <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-plus" :aria-label="'Frontage +10 ft'" @click="mapRef?.nudgeEdit('frontage', 10)" />
          </div>
        </div>
        <div class="flex items-center justify-between gap-1 rounded-lg bg-white/5 px-2 py-1.5">
          <span class="text-xs text-white/60">Depth</span>
          <div class="flex items-center gap-1">
            <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-minus" :aria-label="'Depth −10 ft'" @click="mapRef?.nudgeEdit('depth', -10)" />
            <span class="w-14 text-center font-mono text-xs tabular-nums">{{ editLive?.depthFt ?? editCamp.depthFt }} ft</span>
            <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-plus" :aria-label="'Depth +10 ft'" @click="mapRef?.nudgeEdit('depth', 10)" />
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton size="sm" color="success" class="flex-1" icon="i-lucide-check" :loading="editSaving" @click="saveEdit">Save boundary</UButton>
        <UButton size="sm" color="neutral" variant="ghost" class="text-white/70 hover:text-white" :disabled="editSaving" @click="exitEdit">Cancel</UButton>
      </div>
    </div>

    <!-- lower-left stack: gate status widget above the layers panel -->
    <div class="pointer-events-none absolute bottom-4 left-3 flex flex-col items-start gap-2">
      <NuxtLink
        to="/gate"
        class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#26211a]/85 px-3 py-1.5 text-sm text-white shadow-lg backdrop-blur-xl"
      >
        <UIcon name="i-lucide-traffic-cone" class="size-4 text-primary" />
        <span class="font-medium">Gate</span>
        <span class="text-white/60">{{ gateStatusLabel }}</span>
        <span class="size-2.5 rounded-full ring-1 ring-white/20" :style="{ background: gateRoadColor ?? '#6b7280' }" />
      </NuxtLink>
      <!-- layers panel (doubles as the legend) -->
      <div class="pointer-events-auto w-44 overflow-hidden rounded-xl border border-white/10 bg-[#26211a]/85 text-xs text-white shadow-lg backdrop-blur-xl">
      <button type="button" class="flex w-full items-center gap-1.5 px-3 py-2 font-display font-semibold" @click="panelOpen = !panelOpen">
        <UIcon name="i-lucide-layers" class="size-3.5 text-primary" />Layers
        <UIcon :name="panelOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="ml-auto size-3.5 text-white/60" />
      </button>
      <div v-show="panelOpen" class="space-y-1 px-3 pb-2.5">
        <div class="flex gap-1 rounded-lg bg-white/5 p-0.5">
          <button type="button" class="flex-1 rounded-md py-1 text-[11px] font-medium transition" :class="basemap === 'blocks' ? 'bg-primary text-white' : 'text-white/55 hover:text-white'" @click="basemap = 'blocks'">Blocks</button>
          <button type="button" class="flex-1 rounded-md py-1 text-[11px] font-medium transition" :class="basemap === 'lines' ? 'bg-primary text-white' : 'text-white/55 hover:text-white'" @click="basemap = 'lines'">Streets</button>
        </div>
        <button type="button" class="flex w-full items-center gap-1.5" :class="!shadowMode && 'opacity-40'" @click="shadowMode = !shadowMode">
          <UIcon name="i-lucide-sun" class="size-3.5" :class="shadowMode ? 'text-amber-400' : 'text-white/60'" />Sun &amp; shade
          <UIcon :name="shadowMode ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="ml-auto size-3 text-white/60" />
        </button>
        <button type="button" class="flex w-full items-center gap-1.5" :class="!windMode && 'opacity-40'" :disabled="!windInfo" @click="windMode = !windMode">
          <UIcon name="i-lucide-wind" class="size-3.5" :class="windMode ? 'text-sky-300' : 'text-white/60'" />Live wind
          <UIcon :name="windMode ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="ml-auto size-3 text-white/60" />
        </button>
        <button type="button" class="flex w-full items-center gap-1.5" :class="!layers.camps && 'opacity-40'" @click="layers.camps = !layers.camps">
          <span class="inline-block size-2 rounded-full" style="background:#d6336c" />Camps
          <UIcon :name="layers.camps ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="ml-auto size-3 text-white/60" />
        </button>
        <button type="button" class="flex w-full items-center gap-1.5" :class="!layers.art && 'opacity-40'" @click="layers.art = !layers.art">
          <span class="inline-block size-2 rounded-full" style="background:#7c3aed" />Art
          <UIcon :name="layers.art ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="ml-auto size-3 text-white/60" />
        </button>
        <button type="button" class="flex w-full items-center gap-1.5" :class="!layers.toilets && 'opacity-40'" @click="layers.toilets = !layers.toilets">
          <span class="inline-block size-2 rounded-full" style="background:#3f6212" />Porta-potties
          <UIcon :name="layers.toilets ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="ml-auto size-3 text-white/60" />
        </button>
        <p class="border-t border-white/10 pt-1.5 font-medium text-white/45">Services</p>
        <button type="button" class="flex w-full items-center gap-1.5" :class="!layers.medical && 'opacity-40'" @click="layers.medical = !layers.medical">
          <span class="inline-block size-2 rounded-full" style="background:#dc2626" />Medical
          <UIcon :name="layers.medical ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="ml-auto size-3 text-white/60" />
        </button>
        <button type="button" class="flex w-full items-center gap-1.5" :class="!layers.safety && 'opacity-40'" @click="layers.safety = !layers.safety">
          <span class="inline-block size-2 rounded-full" style="background:#2563eb" />Rangers · safety
          <UIcon :name="layers.safety ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="ml-auto size-3 text-white/60" />
        </button>
        <button type="button" class="flex w-full items-center gap-1.5" :class="!layers.services && 'opacity-40'" @click="layers.services = !layers.services">
          <span class="inline-block size-2 rounded-full" style="background:#0e7490" />Ice · info · DPW
          <UIcon :name="layers.services ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="ml-auto size-3 text-white/60" />
        </button>
        <button type="button" class="flex w-full items-center gap-1.5" :class="!layers.transport && 'opacity-40'" @click="layers.transport = !layers.transport">
          <span class="inline-block size-2 rounded-full" style="background:#d97706" />Airport · gate · fuel
          <UIcon :name="layers.transport ? 'i-lucide-eye' : 'i-lucide-eye-off'" class="ml-auto size-3 text-white/60" />
        </button>
        <ul class="space-y-0.5 border-t border-white/10 pt-1.5 text-white/50">
          <li><span class="mr-1.5 inline-block size-2 rounded-full align-middle" style="background:#27a3df" />Camp blocks</li>
          <li><span class="mr-1.5 inline-block size-2 rounded-full bg-white align-middle" />The Man · Center Camp</li>
          <li><span class="mr-1.5 inline-block h-0 w-3 border-t-2 border-dashed align-middle" style="border-color:#e1241a" />Trash fence</li>
        </ul>
      </div>
      </div>
    </div>

    <!-- top-left stack: weather pill · live wind readout -->
    <div class="pointer-events-none absolute left-3 top-16 flex flex-col items-start gap-2">
      <!-- weather pill -->
      <NuxtLink
        v-if="wx"
        to="/live"
        class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#26211a]/85 px-3 py-1.5 text-sm text-white shadow-lg backdrop-blur-xl"
      >
        <UIcon :name="wmo(wx.weather_code).icon" class="size-4 text-primary" />
        <span class="font-medium">{{ Math.round(wx.temperature_2m) }}°</span>
        <span class="text-white/60">{{ Math.round(wx.wind_gusts_10m) }} mph</span>
        <span class="size-2 rounded-full" :style="{ background: dustRisk(wx.wind_gusts_10m).color }" />
      </NuxtLink>

      <!-- live wind readout (when the Wind layer is on) -->
      <div v-if="windMode && windInfo" class="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#26211a]/85 px-3 py-2 text-white shadow-lg backdrop-blur-xl">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-full" :style="{ background: `${windInfo.color}22` }">
          <UIcon name="i-lucide-arrow-up" class="size-5 transition-transform" :style="{ transform: `rotate(${(windInfo.dir + 135) % 360}deg)`, color: windInfo.color }" />
        </span>
        <div class="leading-tight">
          <p class="text-sm"><b>{{ Math.round(windInfo.speed) }} mph</b> <span class="text-white/55">gusts {{ Math.round(windInfo.gusts) }}</span></p>
          <p class="text-xs text-white/60">from the {{ windInfo.from }} · {{ windInfo.label }}</p>
        </div>
      </div>
    </div>

    <!-- bottom-right stack: compass rose · Meshtastic mesh -->
    <div class="pointer-events-none absolute bottom-20 right-4 flex flex-col items-end gap-2 sm:bottom-6">
      <CompassRose />
      <!-- Meshtastic mesh radio -->
      <ClientOnly>
        <MeshControl />
      </ClientOnly>
    </div>

    <!-- sun & shade time control -->
    <div v-if="shadowMode" class="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center px-4">
      <div class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#26211a]/90 px-3 py-2.5 text-white shadow-lg backdrop-blur-xl">
        <UIcon name="i-lucide-sun" class="size-5 shrink-0 text-amber-400" />
        <input v-model="shadowDate" type="date" class="shrink-0 rounded-md bg-white/10 px-2 py-1 text-xs [color-scheme:dark]">
        <input v-model.number="shadowMin" type="range" min="0" max="900" step="15" class="min-w-0 flex-1 accent-amber-400" aria-label="Time of day">
        <span class="shrink-0 text-sm font-medium tabular-nums">{{ shadowTimeLabel }}</span>
        <button type="button" class="shrink-0 text-white/60 hover:text-white" aria-label="Close" @click="shadowMode = false">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>
    </div>

    <!-- GPS readout pill (bottom center) — only once we have a location fix;
         no persistent "tap the map" hint bar cluttering the bottom. -->
    <div v-if="readout" class="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
      <div class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#26211a]/85 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
        <UIcon name="i-lucide-navigation" class="size-4 text-primary" />
        <span class="font-medium">{{ readout }}</span>
        <span v-if="accuracyLabel" class="text-xs" :class="accuracyRough ? 'text-amber-300' : 'text-white/50'">
          {{ accuracyLabel }}
        </span>
      </div>
    </div>

    <!-- auth modal -->
    <UModal v-model:open="authOpen" :title="mode === 'register' ? 'Create account' : 'Log in'">
      <template #body>
        <form class="space-y-3" @submit.prevent="submitAuth">
          <UInput v-model="form.email" type="email" placeholder="email" required class="w-full" />
          <UInput v-model="form.password" type="password" placeholder="password" required class="w-full" />
          <UInput v-if="mode === 'register'" v-model="form.displayName" placeholder="display name (optional)" class="w-full" />
          <p v-if="authError" class="text-sm text-red-600">{{ authError }}</p>
          <UButton type="submit" block :loading="busy">
            {{ mode === 'register' ? 'Sign up' : 'Log in' }}
          </UButton>
          <button type="button" class="w-full text-center text-xs text-(--ui-text-muted) underline" @click="mode = mode === 'login' ? 'register' : 'login'">
            {{ mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Log in' }}
          </button>
          <NuxtLink v-if="mode === 'login'" to="/forgot-password" class="block text-center text-xs text-(--ui-text-muted) underline" @click="authOpen = false">
            Forgot your password?
          </NuxtLink>
        </form>
      </template>
    </UModal>

    <!-- drop pin modal -->
    <UModal v-model:open="dropOpen" :title="creatingNew ? `Drop my ${dropKind}` : `Move my ${dropKind}`" :dismissible="false">
      <template #body>
        <form class="space-y-3" @submit.prevent="dropPin">
          <p class="text-sm">
            Location: <b>{{ effectiveAddressNamed ?? '—' }}</b>
            <span class="text-(--ui-text-muted)"> · {{ usingManual ? 'typed' : 'exact pin' }}</span>
          </p>
          <!-- Pick which item to move, or create a new one. Art always supports
               several; camps do too for Hubs (otherwise a camp is one per user). -->
          <USelect
            v-if="(dropKind === 'art' || canMultiCamp) && myItems.length"
            v-model="selectedId"
            :items="itemOptions"
            class="w-full"
          />
          <!-- Hubs: edit the picked camp's details instead of moving its pin. -->
          <UButton
            v-if="dropKind === 'camp' && !creatingNew"
            block color="neutral" variant="soft" icon="i-lucide-pencil"
            @click="editSelectedCampDetails"
          >
            Edit this camp's details
          </UButton>
          <UInput
            v-if="creatingNew"
            v-model="newName"
            :placeholder="dropKind === 'camp' ? 'Camp name' : 'Artwork name'"
            class="w-full"
          />
          <div v-if="canManualAddress">
            <UInput v-model="manualAddress" placeholder="Or type an address — e.g. 7:30 & E" class="w-full" />
            <p v-if="manualAddress.trim() && !manualParsed" class="mt-1 text-xs text-red-600">Use “time & street”, e.g. 7:30 & E</p>
          </div>
          <p v-if="dropError" class="text-sm text-red-600">{{ dropError }}</p>
          <div class="flex gap-2">
            <UButton type="submit" class="flex-1" :loading="dropBusy" :disabled="(creatingNew && !newName) || !hasLocation">
              {{ creatingNew ? `Create ${dropKind} & drop pin` : `Save ${dropKind} here` }}
            </UButton>
            <UButton color="neutral" variant="soft" @click="movePin">Move pin</UButton>
            <UButton color="neutral" variant="ghost" @click="cancelDrop">Cancel</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- camp details (name / description / website / contact) -->
    <UModal v-model:open="campEditOpen" title="My camp">
      <template #body>
        <form class="space-y-3" @submit.prevent="saveCampDetails">
          <UInput v-model="campForm.name" placeholder="Camp name" class="w-full" />
          <UTextarea v-model="campForm.description" :rows="3" autoresize placeholder="Description — what's your camp about?" class="w-full" />
          <UInput v-model="campForm.website" type="url" placeholder="Website — https://…" icon="i-lucide-link" class="w-full" />
          <div class="grid grid-cols-2 gap-2">
            <UInput v-model="campForm.hometown" placeholder="Hometown" class="w-full" />
            <UInput v-model="campForm.contactEmail" type="email" placeholder="Contact email" class="w-full" />
          </div>
          <div>
            <p class="mb-1 text-xs text-(--ui-text-muted)">Plot size (optional) — draws a footprint on the map as you zoom in</p>
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model.number="campForm.frontageFt" type="number" min="0" placeholder="Frontage (ft)" class="w-full" />
              <UInput v-model.number="campForm.depthFt" type="number" min="0" placeholder="Depth (ft)" class="w-full" />
            </div>
          </div>
          <p v-if="campSaveError" class="text-sm text-red-600">{{ campSaveError }}</p>
          <div class="flex gap-2">
            <UButton type="submit" class="flex-1" :loading="campSaveBusy" :disabled="!campForm.name.trim()">Save</UButton>
            <UButton color="neutral" variant="soft" icon="i-lucide-map-pin" @click="moveCampPin">Move pin</UButton>
          </div>
          <UButton v-if="campEditId" block color="success" variant="soft" icon="i-lucide-frame" @click="editMyBoundary">Edit boundary on map</UButton>
        </form>
      </template>
    </UModal>
  </div>
</template>
