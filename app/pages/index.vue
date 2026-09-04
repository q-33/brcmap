<script setup lang="ts">
import { CITY_YEAR, describeLatLng, formatAddress, formatAddressNamed, parseAddress } from '~~/lib/brc/geocode'
import { bounds, normalizeUnit, parseSvgToUnitPolygon, toOffsets, type Pt } from '~~/lib/footprint'
import { BMIR, SHOUTING_FIRE } from '~~/lib/radio'
import { dustRisk, rainIntensity, wmo } from '~~/lib/weather'

function namedAddress(s: string | null | undefined): string {
  if (!s)
    return ''
  const a = parseAddress(s)
  return a ? formatAddressNamed(a) : s
}

interface CampPin { id?: string, kind?: 'camp' | 'art', canMove?: 0 | 1, name: string, lat: number, lng: number, address: string, description?: string | null, website?: string | null, hometown?: string | null }

definePageMeta({ layout: false })

const { loggedIn, user, fetch: refreshSession } = useUserSession()
const { hasFeature, refreshMe, isAdmin, canManageCamps, canMultiCamp, unreadMessages } = useMe()

// account dropdown — quick links to messages + the admin/GPE tools + log out
const userMenu = computed(() => {
  const groups: any[] = [[{ label: user.value?.displayName || user.value?.email || 'Account', type: 'label' as const }]]
  groups.push([{
    label: unreadMessages.value ? `Messages (${unreadMessages.value})` : 'Messages',
    icon: 'i-lucide-mail',
    to: '/messages',
  }])
  const tools: any[] = []
  // BM Org can place/move any camp from the Camps list (admins use the dashboard).
  if (canManageCamps.value && !isAdmin.value)
    tools.push({ label: 'Place camps', icon: 'i-lucide-map-pin', to: '/camps' })
  // Partner projects building their own BRC Map layer (granted per account).
  // This covers admins too — hasFeature() returns true for them, matching
  // requireFeature() on the server — so there is deliberately no second entry
  // in the admin block below. Adding one there put it in the menu twice.
  if (hasFeature('data-export'))
    tools.push({ label: 'Data export', icon: 'i-lucide-download', to: '/export' })
  if (isAdmin.value)
    tools.push(
      { label: 'Admin dashboard', icon: 'i-lucide-shield', to: '/admin' },
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

// camps + art -> pins. `geo` (campId → exact footprint/height) is merged in for
// camps so the Sun & Shade tool can extrude each camp's real geometry.
function toPins(items: any, geo?: Map<string, { footprint: [number, number][] | null, heightFt: number | null }>, kind: 'camp' | 'art' = 'camp'): CampPin[] {
  return (items ?? []).flatMap((c: any) => {
    const g = geo?.get(c.id)
    return (c.locations ?? [])
      .filter((l: any) => l.gpsLatitude != null && l.gpsLongitude != null)
      .map((l: any) => ({
        id: c.id,
        kind,
        // Whether THIS viewer may drag THIS pin. The rule lives here because the
        // page is what knows who you are; /api/locations enforces it again, so a
        // forged flag buys nothing but a 403.
        canMove: canMovePin(kind, c) ? 1 : 0,
        name: c.name,
        lat: l.gpsLatitude,
        lng: l.gpsLongitude,
        address: namedAddress(l.addressString),
        // carried through for the pin popup
        description: c.description ?? null,
        website: c.website || c.url || null,
        hometown: c.hometown ?? null,
        frontageFt: c.frontageFt ?? null,
        depthFt: c.depthFt ?? null,
        heightFt: g?.heightFt ?? null,
        footprint: g?.footprint ?? null,
      }))
  })
}
// client-only: the map (and its pins) render client-side after hydration anyway,
// so keep the homepage SSR shell independent of the DB — it renders instantly and
// stays resilient if the DB is slow/down, and offline the cached shell needs no
// data. Pins populate reactively once these resolve (PlayaMap watches the props).
const { data: campsData, refresh: refreshCamps } = await useFetch('/api/camps', { server: false, lazy: true, default: () => [] })
const { data: artData, refresh: refreshArt } = await useFetch('/api/art', { server: false, lazy: true, default: () => [] })
// Exact camp footprints/heights (Sun & Shade). Defensive endpoint → [] if the
// migration hasn't run, so this never blocks the map.
const { data: geoData, refresh: refreshGeo } = await useFetch<any[]>('/api/camps/geometry', { server: false, lazy: true, default: () => [] })
const geoByCamp = computed(() => new Map((geoData.value ?? []).map((g: any) => [g.campId, { footprint: (g.footprint ?? null) as [number, number][] | null, heightFt: (g.heightFt ?? null) as number | null }])))
const pins = computed<CampPin[]>(() => toPins(campsData.value, geoByCamp.value))
const artPins = computed<CampPin[]>(() => toPins(artData.value, undefined, 'art'))

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
// Civic landmarks are code constants, so admins correct them through an
// override table rather than a deploy. Burners keep writing in about pins that
// are a block off, and each report used to cost a code change.
const { data: landmarkOverrides, refresh: refreshLandmarks } = await useFetch<{ name: string, lat: number, lng: number }[]>(
  '/api/landmarks',
  { server: false, lazy: true, default: () => [] },
)
// Who may drag a camp or art pin. Mirrors /api/locations exactly: admins and Org
// place any camp, admins alone place any artwork, and everyone can move their
// own. Kept in step with the server rather than guessed at — a button that 403s
// on release is worse than no button.
function canMovePin(kind: 'camp' | 'art', row: any): boolean {
  const mine = !!user.value?.id && row?.ownerId === user.value.id
  if (mine)
    return true
  return kind === 'camp' ? canManageCamps.value : isAdmin.value
}

// Arm the on-map boundary editor straight from a camp popup. Same destination as
// the Camps page's "Edit boundary on map" button — the ?editCamp= query is what
// the editor watches.
function onPinEdit(p: { id: string, name: string }) {
  if (p.id)
    navigateTo({ query: { ...route.query, editCamp: p.id } })
}

async function onPinMove(p: { kind: 'camp' | 'art', id: string, name: string, lat: number, lng: number }) {
  try {
    await $fetch('/api/locations', {
      method: 'POST',
      body: p.kind === 'camp' ? { campId: p.id, lat: p.lat, lng: p.lng } : { artId: p.id, lat: p.lat, lng: p.lng },
    })
    await (p.kind === 'camp' ? refreshCamps() : refreshArt())
    toast.add({ title: `Moved ${p.name}`, description: 'The new spot is saved.', color: 'success' })
  }
  catch (err: any) {
    toast.add({ title: 'Could not move that pin', description: err?.data?.statusMessage ?? 'Try again', color: 'error' })
  }
}

async function onLandmarkMove(p: { name: string, lat: number, lng: number }) {
  try {
    await $fetch('/api/admin/landmarks', { method: 'POST', body: p })
    await refreshLandmarks()
    toast.add({ title: `Moved ${p.name}`, description: 'Everyone sees the new position within a minute.', color: 'success' })
  }
  catch (err: any) {
    toast.add({ title: 'Could not move that pin', description: err?.data?.statusMessage ?? 'Try again', color: 'error' })
  }
}

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
const mapRef = ref<{
  nudgeEdit: (w: 'frontage' | 'depth', d: number) => void
  startFootprintDraw: (pin: { lng: number, lat: number }, initial: [number, number][] | null) => void
  undoFootprintVertex: () => void
  clearFootprintDraw: () => void
  stopFootprintDraw: () => void
} | null>(null)
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
  //
  // Uses the SAME rule as the map popup's buttons, deliberately. This used to
  // test myCamps, which is fetched lazily and is empty until you open the camp
  // panel — so arriving straight from the map popup would have failed the check
  // and the editor would simply never appear. Ownership is read off the camp row
  // instead; the server re-checks on every save.
  if (!canMovePin('camp', c))
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

// Live weather → the compact pill, and the wind that drives the dust animation.
//
// The pill now leads with a STATION reading — a sensor inside the fence beats a
// model reading a 9 km grid square, and BRC NOC is nominated to speak for the
// city. It falls back to the model the moment no station is reporting.
//
// client-only: this proxies external APIs; never let a slow upstream hang SSR.
interface PillStation {
  label: string
  fresh: boolean
  tempF: number | null
  windMph: number | null
  gustMph: number | null
  windDirDeg: number | null
}
const { data: weatherData } = await useFetch<{
  current: { temperature_2m: number, weather_code: number, wind_speed_10m: number, wind_gusts_10m: number, wind_direction_10m: number } | null
  stations: PillStation[]
}>('/api/weather', { server: false, lazy: true })

const wx = computed(() => weatherData.value?.current ?? null)
const { temp: fmtTemp, wind: fmtWind, windUnit } = useUnits()

/** The station the pill speaks with: the API already sorts the nominated one first. */
const pillStation = computed(() => (weatherData.value?.stations ?? []).find(s => s.fresh) ?? null)

/** What the pill shows, whichever source is answering. */
const pill = computed(() => {
  const st = pillStation.value
  if (st && st.tempF != null) {
    return {
      tempF: st.tempF,
      gustMph: st.gustMph ?? st.windMph ?? 0,
      code: wx.value?.weather_code ?? 0,
      source: st.label,
      live: true,
    }
  }
  const c = wx.value
  if (!c)
    return null
  return { tempF: c.temperature_2m, gustMph: c.wind_gusts_10m, code: c.weather_code, source: 'forecast', live: false }
})

// Radio from the map. The player itself lives in useRadio() — outside the
// component tree — so walking from here to the camp list does not cut the
// music. These pills are only controls.
const { toggle: toggleRadio, isPlaying, isLoading } = useRadio()

// Wind for the dust animation: the station's if we have one, else the model's.
// Wind for the blowing-dust animation. Direction and gusts only: the readout
// that used the speed, compass point and risk label is gone, and computing them
// for nobody is just work the phone does for free.
const windInfo = computed(() => {
  const st = pillStation.value
  if (st && st.windDirDeg != null && st.windMph != null)
    return { dir: st.windDirDeg, gusts: st.gustMph ?? st.windMph, color: dustRisk(st.gustMph ?? st.windMph).color }
  const c = wx.value
  if (!c || c.wind_direction_10m == null)
    return null
  return { dir: c.wind_direction_10m, gusts: c.wind_gusts_10m, color: dustRisk(c.wind_gusts_10m).color }
})

// Rain for the map animation. Always the model's WMO code, even when a station
// is speaking for the city otherwise: stations report rain accumulated today,
// which stays high long after the sky clears, so it cannot answer "is it raining
// right now". Null when it is dry, so the canvas skips the field entirely.
const rainInfo = computed(() => {
  const code = wx.value?.weather_code
  if (code == null)
    return null
  const level = rainIntensity(code)
  return level ? { level } : null
})

// Everything that hangs off the top of the map clears the weather banner by the
// same amount, so the banner's height is stated once here rather than copied
// into five class lists that would drift apart the first time it changed.
const belowBanner = computed(() => (pill.value ? 'top-28' : 'top-16'))

// Placement and edit modes put their own banner in that same slot, and on a
// phone it spans nearly the full width — so the radio pills would sit
// underneath it. They are also the last thing you want while dropping a pin,
// so they stand down until the edit is finished.
const editingOverlay = computed(() => !!((dropMode.value && !dropOpen.value) || adminPlaceCamp.value || fpDrawing.value || editCamp.value))

// map layer visibility (the legend doubles as the toggle control)
// Porta-potties default OFF — the 2026 placement isn't known yet, so we don't
// want to imply the (stale) pins are accurate. Users can re-enable in the legend.
const layers = reactive({ camps: true, art: true, toilets: true, medical: true, safety: true, services: true, transport: true })
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
// Pass the placed camps so the readout can name the one you're standing on —
// "7:45 & Bodhi, Man-side — near PLUR Pups" beats a bare intersection on playa.
const readout = computed(() => position.value ? describeLatLng(position.value, pins.value) : null)
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
interface MyItem { id: string, name: string, artist?: string | null, description?: string | null, website?: string | null, contactEmail?: string | null, hometown?: string | null, frontageFt?: number | null, depthFt?: number | null }
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
const pendingLabel = computed(() => pendingLoc.value ? describeLatLng(pendingLoc.value, pins.value) : null)
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
  // footprint / height editor — capture the pin location and load any geometry
  const loc = (c as any).locations?.slice?.().sort((a: any, b: any) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
  fpCampLoc.value = loc?.gpsLatitude != null ? { lat: loc.gpsLatitude, lng: loc.gpsLongitude } : null
  loadGeometry(c.id)
  campEditOpen.value = true
}

// --- footprint + height editor (Sun & Shade exact geometry) -----------------
const fpUnit = ref<Pt[] | null>(null) // normalized shape (encodes orientation)
const fpSizeFt = ref(30) // largest dimension, feet
const fpRotDeg = ref(0)
const fpHeightFt = ref<number | null>(null)
const fpCampLoc = ref<{ lng: number, lat: number } | null>(null)
const fpBusy = ref(false)
const fpError = ref('')
const fpDrawing = ref(false) // freehand on-map draw mode active
const fpOffsets = computed<Pt[] | null>(() => (fpUnit.value && fpUnit.value.length >= 3) ? toOffsets(fpUnit.value, fpSizeFt.value * 0.3048, fpRotDeg.value) : null)
// live preview handed to <PlayaMap> (renders the footprint + updates the shade).
// Suppressed while the freehand draw layer is active so there's only one preview.
const editFootprint = computed(() => (!fpDrawing.value && fpCampLoc.value && fpOffsets.value) ? { lng: fpCampLoc.value.lng, lat: fpCampLoc.value.lat, offsets: fpOffsets.value } : null)

async function loadGeometry(id: string) {
  fpUnit.value = null
  fpSizeFt.value = 30
  fpRotDeg.value = 0
  fpHeightFt.value = null
  fpError.value = ''
  try {
    const g: any = await $fetch(`/api/camps/${id}/geometry`)
    if (g?.heightFt != null)
      fpHeightFt.value = g.heightFt
    if (Array.isArray(g?.footprint) && g.footprint.length >= 3) {
      const off = g.footprint as Pt[]
      fpUnit.value = normalizeUnit(off)
      const b = bounds(off)
      fpSizeFt.value = Math.round(Math.max(b.w, b.h) / 0.3048) || 30
    }
  }
  catch { /* no geometry yet */ }
}

async function onSvgUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  fpError.value = ''
  try {
    fpUnit.value = parseSvgToUnitPolygon(await file.text())
    fpRotDeg.value = 0
  }
  catch (err: any) {
    fpError.value = err?.message ?? 'Could not read that SVG'
  }
  finally {
    input.value = '' // let the same file be re-selected
  }
}

async function saveGeometry() {
  const id = campEditId.value
  if (!id)
    return
  fpBusy.value = true
  fpError.value = ''
  try {
    await $fetch(`/api/camps/${id}/geometry`, { method: 'PUT', body: { footprint: fpOffsets.value, heightFt: fpHeightFt.value ?? null } })
    await refreshGeo()
    toast.add({ title: 'Geometry saved', description: fpOffsets.value ? 'Footprint + height applied to Sun & Shade.' : 'Height applied to Sun & Shade.', color: 'success', icon: 'i-lucide-check' })
  }
  catch (e: any) {
    fpError.value = e?.data?.statusMessage ?? 'Could not save geometry'
  }
  finally {
    fpBusy.value = false
  }
}

async function clearGeometry() {
  const id = campEditId.value
  if (!id)
    return
  fpBusy.value = true
  fpError.value = ''
  try {
    await $fetch(`/api/camps/${id}/geometry`, { method: 'DELETE' })
    fpUnit.value = null
    fpHeightFt.value = null
    await refreshGeo()
  }
  catch (e: any) {
    fpError.value = e?.data?.statusMessage ?? 'Could not clear'
  }
  finally {
    fpBusy.value = false
  }
}

// --- freehand draw mode (on-map) --------------------------------------------
const fpDrawOffsets = ref<Pt[]>([])
function onFootprintDraw(offsets: Pt[]) {
  fpDrawOffsets.value = offsets
}
function startDrawFootprint() {
  if (!campEditId.value || !fpCampLoc.value)
    return
  fpDrawing.value = true
  campEditOpen.value = false
  // seed with the current (SVG/loaded) footprint so you can refine it by hand
  nextTick(() => mapRef.value?.startFootprintDraw(fpCampLoc.value!, fpOffsets.value ?? null))
}
function stopDrawFootprint() {
  mapRef.value?.stopFootprintDraw()
  fpDrawing.value = false
  fpDrawOffsets.value = []
}
async function saveDrawFootprint() {
  const id = campEditId.value
  if (!id)
    return
  fpBusy.value = true
  fpError.value = ''
  try {
    const footprint = fpDrawOffsets.value.length >= 3 ? fpDrawOffsets.value : null
    await $fetch(`/api/camps/${id}/geometry`, { method: 'PUT', body: { footprint, heightFt: fpHeightFt.value ?? null } })
    await refreshGeo()
    toast.add({ title: 'Footprint saved', description: 'Applied to Sun & Shade.', color: 'success', icon: 'i-lucide-check' })
    stopDrawFootprint()
  }
  catch (e: any) {
    fpError.value = e?.data?.statusMessage ?? 'Could not save'
  }
  finally {
    fpBusy.value = false
  }
}

// From the drop sheet: edit the picked camp's details instead of moving its pin.
function editSelectedCampDetails() {
  const c = currentCamp.value
  cancelDrop()
  openCampEdit(c)
}

// --- art details editor (owner) — mirrors the camp editor -------------------
const artEditOpen = ref(false)
const artEditId = ref<string>('')
const artForm = reactive({ name: '', artist: '', description: '', website: '', hometown: '', contactEmail: '' })
const artSaveBusy = ref(false)
const artSaveError = ref('')
const currentArt = computed<MyItem | null>(() => (myArt.value ?? []).find(a => a.id === selectedId.value) ?? null)

function openArtEdit(item: MyItem | null) {
  const a = item
  if (!a)
    return
  artEditId.value = a.id
  artForm.name = a.name ?? ''
  artForm.artist = a.artist ?? ''
  artForm.description = a.description ?? ''
  artForm.website = a.website ?? ''
  artForm.hometown = a.hometown ?? ''
  artForm.contactEmail = a.contactEmail ?? ''
  artSaveError.value = ''
  artEditOpen.value = true
}

// From the drop sheet: edit the picked artwork's details instead of moving its pin.
function editSelectedArtDetails() {
  const a = currentArt.value
  cancelDrop()
  openArtEdit(a)
}

async function saveArtDetails() {
  const id = artEditId.value
  if (!id || !artForm.name.trim())
    return
  artSaveBusy.value = true
  artSaveError.value = ''
  try {
    await $fetch(`/api/art/${id}/details`, { method: 'PATCH', body: { ...artForm } })
    await Promise.all([refreshMineArt(), refreshArt()])
    artEditOpen.value = false
  }
  catch (e: any) {
    artSaveError.value = e?.data?.statusMessage ?? 'Could not save'
  }
  finally {
    artSaveBusy.value = false
  }
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
        <PlayaMap ref="mapRef" :camps="pins" :art-pins="artPins" :mesh-peers="meshPeers" :focus="focus" :wind="windInfo" :rain="rainInfo" :layers="layers" :basemap="basemap" :drop-mode="!!dropMode || !!adminPlaceCamp" :sun-time="sunInstant" :edit-camp="editCamp" :edit-footprint="editFootprint" class="size-full" @position="onPosition" @pick="onPick" @edit-change="onEditChange" :can-move-landmarks="isAdmin" :landmark-overrides="landmarkOverrides ?? []"
          @footprint-draw="onFootprintDraw" @landmark-move="onLandmarkMove" @pin-move="onPinMove" @pin-edit="onPinEdit" />
      </ClientOnly>
    </div>

    <!-- floating top bar -->
    <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
      <div class="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#26211a]/85 p-1 pl-3 text-white shadow-lg backdrop-blur-xl">
        <NuxtLink to="/" class="mr-1 flex items-center gap-1.5">
          <UIcon name="i-lucide-flame" class="size-4 text-primary" />
          <span class="font-display text-sm font-bold uppercase tracking-wide">BRC<span class="text-primary">Map</span></span>
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
    <div v-if="dropMode && !dropOpen" class="pointer-events-auto absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-primary/40 bg-[#26211a]/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-xl" :class="belowBanner">
      <UIcon name="i-lucide-hand-pointer" class="size-4 text-primary" />
      <span>Tap the map to place your {{ dropKind }}</span>
      <button type="button" class="text-white/60 underline hover:text-white" @click="cancelDrop">Cancel</button>
    </div>

    <!-- place/move-any-camp banner (from the Camps list "Place on map", or /admin) -->
    <div v-if="adminPlaceCamp" class="pointer-events-auto absolute left-1/2 z-10 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-primary/40 bg-[#26211a]/90 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-xl" :class="belowBanner">
      <UIcon name="i-lucide-shield" class="size-4 shrink-0 text-primary" />
      <span class="truncate">Tap to {{ adminPlaceCamp.lat != null ? 'move' : 'place' }} <b>{{ adminPlaceCamp.name }}</b></span>
      <span v-if="adminPlaceSaved" class="shrink-0 text-green-400">saved&nbsp;✓</span>
      <NuxtLink :to="isAdmin ? '/admin' : '/camps'" class="shrink-0 text-white/60 underline hover:text-white">Done</NuxtLink>
    </div>

    <!-- live boundary editor: drag the pin + green edge handles on the map; this
         panel mirrors the dimensions and offers precise +/- nudges + Save. -->
    <!-- freehand footprint draw panel (Sun & Shade) -->
    <div v-if="fpDrawing" class="pointer-events-auto absolute left-1/2 z-10 flex w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-2.5 rounded-2xl border border-primary/50 bg-[#26211a]/92 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-xl" :class="belowBanner">
      <div class="flex items-start gap-2">
        <UIcon name="i-lucide-pencil-ruler" class="mt-0.5 size-4 shrink-0 text-primary" />
        <span class="min-w-0 flex-1 text-xs leading-snug text-white/80">Tap the map to add points · drag a point to move · double-tap a point to delete.</span>
        <span class="shrink-0 font-mono text-xs text-white/60">{{ fpDrawOffsets.length }} pts</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-white/60">Height</span>
        <input v-model.number="fpHeightFt" type="number" min="0" max="200" placeholder="ft" class="w-20 rounded bg-white/10 px-2 py-1 text-sm text-white outline-none placeholder:text-white/40">
        <span class="text-xs text-white/50">ft</span>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-undo-2" @click="mapRef?.undoFootprintVertex()">Undo</UButton>
        <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-eraser" @click="mapRef?.clearFootprintDraw()">Clear</UButton>
        <UButton size="sm" color="primary" class="ml-auto" :loading="fpBusy" :disabled="fpDrawOffsets.length < 3 && fpHeightFt == null" icon="i-lucide-check" @click="saveDrawFootprint">Save</UButton>
        <UButton size="sm" color="neutral" variant="ghost" @click="stopDrawFootprint">Cancel</UButton>
      </div>
      <p v-if="fpError" class="text-xs text-red-300">{{ fpError }}</p>
    </div>

    <div v-if="editCamp" class="pointer-events-auto absolute left-1/2 z-10 flex w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col gap-2.5 rounded-2xl border border-green-500/40 bg-[#26211a]/92 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-xl" :class="belowBanner">
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

    <!-- lower-left stack: the webcast above the layers panel -->
    <div class="pointer-events-none absolute bottom-4 left-3 flex flex-col items-start gap-2">
      <!-- The official webcast, one tap away from the map. Deliberately a link
           rather than an inline player: video over the city you are trying to
           read is the wrong trade, and the player is a big download that /live
           already gates behind a tap. -->
      <NuxtLink
        to="/live"
        class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#26211a]/85 px-3 py-1.5 text-sm text-white shadow-lg backdrop-blur-xl"
        aria-label="Watch the Burning Man live stream on the Live page"
      >
        <UIcon name="i-lucide-video" class="size-4 text-primary" />
        <span class="font-medium">Live Stream</span>
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
          <li><span class="mr-1.5 inline-block size-2 rounded-full bg-white align-middle" />The Man · Center Camp</li>
          <li><span class="mr-1.5 inline-block h-0 w-3 border-t-2 border-dashed align-middle" style="border-color:#e1241a" />Trash fence</li>
        </ul>
      </div>
      </div>
    </div>

    <!-- Weather banner, full width under the nav. It was a pill in the corner;
         the width is not decoration — it is what lets the dust risk say
         "Dusty — goggles up" instead of being a coloured dot you had to already
         know the code for. On this playa that reading is the point. -->
    <div v-if="pill" class="pointer-events-none absolute inset-x-0 top-16 z-10 px-3">
      <NuxtLink
        to="/live"
        class="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#26211a]/85 px-3.5 py-2 text-sm text-white shadow-lg backdrop-blur-xl sm:gap-3"
        :title="pill.live ? `${pill.source} — measured on the playa` : 'Forecast model'"
      >
        <UIcon :name="wmo(pill.code).icon" class="size-4 shrink-0 text-primary" />
        <span class="font-medium">{{ fmtTemp(pill.tempF) }}</span>
        <span class="hidden text-white/70 sm:inline">{{ wmo(pill.code).label }}</span>
        <span class="text-white/60">{{ fmtWind(pill.gustMph) }} {{ windUnit }}<span class="hidden sm:inline"> gusts</span></span>
        <!-- the dust read, in words now that there is room for them -->
        <span class="flex min-w-0 items-center gap-1.5">
          <span class="size-2 shrink-0 rounded-full" :style="{ background: dustRisk(pill.gustMph).color }" />
          <span class="truncate text-white/80">{{ dustRisk(pill.gustMph).label }}</span>
        </span>
        <span class="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-white/55">
          <span class="hidden truncate md:inline">{{ pill.source }}</span>
          <!-- a quiet mark that this is a real sensor, not a model -->
          <span v-if="pill.live" class="relative flex size-1.5" aria-label="live station">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span class="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
          </span>
        </span>
      </NuxtLink>
    </div>

    <!-- top-left stack: radio -->
    <div v-if="!editingOverlay" class="pointer-events-none absolute left-3 flex flex-col items-start gap-2" :class="belowBanner">
      <!-- Radio, one tap. The playa's own stations; people want them while
           looking at the map, not after navigating away to the Live page.
           Side by side because they are alternatives to each other, and a
           column of them would push the layers panel off a phone screen. -->
      <div class="flex items-center gap-2">
        <button
          v-for="st in [BMIR, SHOUTING_FIRE]"
          :key="st.key"
          type="button"
          class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#26211a]/85 px-3 py-1.5 text-sm text-white shadow-lg backdrop-blur-xl"
          :aria-label="isPlaying(st) ? `Stop ${st.name}` : `Listen to ${st.name} ${st.dial}`"
          @click="toggleRadio(st)"
        >
          <UIcon
            :name="isLoading(st) ? 'i-lucide-loader-circle' : isPlaying(st) ? 'i-lucide-pause' : 'i-lucide-radio'"
            :class="['size-4 text-primary', isLoading(st) && 'animate-spin']"
          />
          <span class="font-medium">{{ st.name }}</span>
          <span class="hidden text-white/60 sm:inline">{{ st.dial.replace(' FM', '') }}</span>
          <span v-if="isPlaying(st)" class="flex items-end gap-0.5" aria-hidden="true">
            <span v-for="(h, i) in [7, 11, 5]" :key="i" class="w-0.5 animate-pulse rounded-full bg-emerald-400" :style="{ height: `${h}px`, animationDelay: `${i * 140}ms` }" />
          </span>
        </button>
      </div>
    </div>

    <!-- bottom-right stack: compass rose · Meshtastic mesh.
         Anchored at bottom-4 to line up with the bottom-left layers stack. -->
    <div class="pointer-events-none absolute bottom-4 right-3 flex flex-col items-end gap-2">
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
    <!-- owner: edit an artwork's details -->
    <UModal v-model:open="artEditOpen" title="My artwork">
      <template #body>
        <form class="space-y-3" @submit.prevent="saveArtDetails">
          <UInput v-model="artForm.name" placeholder="Artwork name" class="w-full" />
          <UInput v-model="artForm.artist" placeholder="Artist / maker (optional)" icon="i-lucide-user" class="w-full" />
          <UTextarea v-model="artForm.description" :rows="3" autoresize placeholder="Description" class="w-full" />
          <UInput v-model="artForm.website" type="url" placeholder="Website — https://…" icon="i-lucide-link" class="w-full" />
          <div class="grid grid-cols-2 gap-2">
            <UInput v-model="artForm.hometown" placeholder="Hometown" class="w-full" />
            <UInput v-model="artForm.contactEmail" type="email" placeholder="Contact email" class="w-full" />
          </div>
          <p v-if="artSaveError" class="text-sm text-red-600">{{ artSaveError }}</p>
          <UButton type="submit" block :loading="artSaveBusy" :disabled="!artForm.name.trim()">Save details</UButton>
        </form>
      </template>
    </UModal>

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
          <!-- Edit the picked item's details instead of moving its pin (camp
               owners/Hubs, and art owners). -->
          <UButton
            v-if="!creatingNew"
            block color="neutral" variant="soft" icon="i-lucide-pencil"
            @click="dropKind === 'camp' ? editSelectedCampDetails() : editSelectedArtDetails()"
          >
            Edit this {{ dropKind === 'camp' ? 'camp' : 'artwork' }}'s details
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

          <!-- Sun & Shade: exact footprint + height (optional, rarely used) -->
          <div v-if="campEditId" class="rounded-lg border border-(--ui-border) bg-(--ui-bg-muted)/40 p-3">
            <p class="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-(--ui-text)">
              <UIcon name="i-lucide-sun" class="size-3.5 text-primary" /> Sun &amp; Shade — exact geometry
            </p>
            <p class="mb-2 text-xs text-(--ui-text-muted)">Optional. Add a height, and/or upload an SVG outline of your structure, then size &amp; rotate it — the shade tool casts your real shape.</p>
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model.number="fpHeightFt" type="number" min="0" max="200" placeholder="Height (ft)" icon="i-lucide-move-vertical" class="w-full" />
              <label class="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-(--ui-border) px-2 text-sm text-(--ui-text-muted) transition hover:bg-(--ui-bg-muted)">
                <UIcon name="i-lucide-upload" class="size-4" />{{ fpUnit ? 'Replace SVG' : 'Upload SVG' }}
                <input type="file" accept=".svg,image/svg+xml" class="hidden" @change="onSvgUpload">
              </label>
            </div>
            <div v-if="fpUnit" class="mt-2 space-y-1.5">
              <label class="block text-xs text-(--ui-text-muted)">Size across — <b class="text-(--ui-text)">{{ fpSizeFt }} ft</b>
                <input v-model.number="fpSizeFt" type="range" min="5" max="300" step="1" class="mt-1 w-full accent-primary">
              </label>
              <label class="block text-xs text-(--ui-text-muted)">Rotation — <b class="text-(--ui-text)">{{ fpRotDeg }}°</b>
                <input v-model.number="fpRotDeg" type="range" min="0" max="359" step="1" class="mt-1 w-full accent-primary">
              </label>
            </div>
            <p v-if="fpError" class="mt-1.5 text-xs text-red-600">{{ fpError }}</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton type="button" size="sm" color="primary" variant="soft" :disabled="!fpCampLoc" icon="i-lucide-pencil-ruler" @click="startDrawFootprint">Draw on map</UButton>
              <UButton type="button" size="sm" color="primary" variant="soft" :loading="fpBusy" icon="i-lucide-save" @click="saveGeometry">Save</UButton>
              <UButton type="button" size="sm" color="neutral" variant="ghost" :disabled="fpBusy || (!fpUnit && fpHeightFt == null)" icon="i-lucide-eraser" @click="clearGeometry">Clear</UButton>
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
