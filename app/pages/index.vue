<script setup lang="ts">
import type { GateStatus } from '~~/lib/gate'
import { CITY_YEAR, describeLatLng, formatAddress, formatAddressNamed, latLngToAddress, parseAddress } from '~~/lib/brc/geocode'
import { gateColor } from '~~/lib/gate'
import { dustRisk, wmo } from '~~/lib/weather'

function namedAddress(s: string | null | undefined): string {
  if (!s)
    return ''
  const a = parseAddress(s)
  return a ? formatAddressNamed(a) : s
}

interface CampPin { name: string, lat: number, lng: number, address: string }

definePageMeta({ layout: false })

const { loggedIn, user, fetch: refreshSession } = useUserSession()
const { hasFeature, refreshMe, isAdmin, isGpe } = useMe()

// account dropdown — quick links to the admin/GPE tools + log out
const userMenu = computed(() => {
  const groups: any[] = [[{ label: user.value?.displayName || user.value?.email || 'Account', type: 'label' as const }]]
  const tools: any[] = []
  if (isGpe.value)
    tools.push({ label: 'Gate conditions', icon: 'i-lucide-traffic-cone', to: '/gate' })
  if (isAdmin.value)
    tools.push(
      { label: 'Admin dashboard', icon: 'i-lucide-shield', to: '/admin' },
      { label: 'Review queue', icon: 'i-lucide-inbox', to: { path: '/admin', query: { tab: 'queue' } } },
      { label: 'Reports', icon: 'i-lucide-flag', to: { path: '/admin', query: { tab: 'reports' } } },
      { label: 'People & roles', icon: 'i-lucide-users', to: { path: '/admin', query: { tab: 'people' } } },
      { label: 'Audit log', icon: 'i-lucide-scroll-text', to: { path: '/admin', query: { tab: 'audit' } } },
    )
  if (tools.length)
    groups.push(tools)
  groups.push([{ label: 'Log out', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: logout }])
  return groups
})

// optional ?lat&lng to focus a camp coming from the Camps list
const route = useRoute()
const focus = computed(() => {
  const lat = Number(route.query.lat)
  const lng = Number(route.query.lng)
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
})

// camps + art -> pins
function toPins(items: any): CampPin[] {
  return (items ?? []).flatMap((c: any) =>
    (c.locations ?? [])
      .filter((l: any) => l.gpsLatitude != null && l.gpsLongitude != null)
      .map((l: any) => ({ name: c.name, lat: l.gpsLatitude, lng: l.gpsLongitude, address: namedAddress(l.addressString) })),
  )
}
const { data: campsData, refresh: refreshCamps } = await useFetch('/api/camps')
const { data: artData, refresh: refreshArt } = await useFetch('/api/art')
const pins = computed<CampPin[]>(() => toPins(campsData.value))
const artPins = computed<CampPin[]>(() => toPins(artData.value))

// live Gate Road condition → colour the gate road + a status dot
const { data: gateData } = await useFetch<{ inbound: { status: GateStatus } | null }>('/api/gate')
const gateRoadColor = computed(() => gateData.value?.inbound ? gateColor(gateData.value.inbound.status) : undefined)

// live weather → a compact pill (temp + gusts + dust) linking to /live
const { data: weatherData } = await useFetch<{ current: { temperature_2m: number, weather_code: number, wind_gusts_10m: number } | null }>('/api/weather')
const wx = computed(() => weatherData.value?.current ?? null)

// map layer visibility (the legend doubles as the toggle control)
const layers = reactive({ camps: true, art: true, toilets: true, medical: true, safety: true, services: true, transport: true })
const panelOpen = ref(true)
const basemap = ref<'blocks' | 'lines'>('blocks')

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
interface MyItem { id: string, name: string }
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
const currentAddress = computed(() =>
  position.value ? formatAddress(latLngToAddress(position.value)) : null,
)
const currentAddressNamed = computed(() =>
  position.value ? formatAddressNamed(latLngToAddress(position.value)) : null,
)

// Manual address entry (gated by the 'manual-address' feature flag): type a BRC
// address instead of relying on GPS — e.g. to mark a camp before arriving.
const canManualAddress = computed(() => hasFeature('manual-address'))
const manualAddress = ref('')
const manualParsed = computed(() => parseAddress(manualAddress.value.trim()))
const usingManual = computed(() => canManualAddress.value && manualAddress.value.trim() !== '')
const effectiveAddress = computed(() =>
  usingManual.value ? (manualParsed.value ? formatAddress(manualParsed.value) : null) : currentAddress.value,
)
const effectiveAddressNamed = computed(() =>
  usingManual.value ? (manualParsed.value ? formatAddressNamed(manualParsed.value) : null) : currentAddressNamed.value,
)

const creatingNew = computed(() => selectedId.value === '')
const myItems = computed<MyItem[]>(() => (dropKind.value === 'camp' ? myCamps.value : myArt.value) ?? [])

async function openDrop(kind: DropKind) {
  dropKind.value = kind
  if (kind === 'camp')
    await refreshMineCamps()
  else
    await refreshMineArt()
  selectedId.value = myItems.value?.[0]?.id ?? ''
  newName.value = ''
  manualAddress.value = ''
  dropError.value = ''
  dropOpen.value = true
}

async function dropPin() {
  if (!effectiveAddress.value)
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
    const locBody = dropKind.value === 'camp'
      ? { campId: id, addressString: effectiveAddress.value }
      : { artId: id, addressString: effectiveAddress.value }
    await $fetch('/api/locations', { method: 'POST', body: locBody })
    await Promise.all([refreshCamps(), refreshArt(), refreshMineCamps(), refreshMineArt()])
    dropOpen.value = false
    newName.value = ''
  }
  catch (e: any) {
    dropError.value = e?.data?.statusMessage ?? 'Could not drop pin'
  }
  finally {
    dropBusy.value = false
  }
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
        <PlayaMap :camps="pins" :art-pins="artPins" :focus="focus" :gate-color="gateRoadColor" :layers="layers" :basemap="basemap" class="size-full" @position="onPosition" />
      </ClientOnly>
    </div>

    <!-- floating top bar -->
    <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
      <div class="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#26211a]/85 p-1 pl-3 text-white shadow-lg backdrop-blur-xl">
        <NuxtLink to="/" class="mr-1 flex items-center gap-1.5">
          <UIcon name="i-lucide-flame" class="size-4 text-primary" />
          <span class="font-display text-sm font-bold uppercase tracking-wide">BurnerMap</span>
        </NuxtLink>
        <UButton to="/camps" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Camps</UButton>
        <UButton to="/art" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Art</UButton>
        <UButton to="/events" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Events</UButton>
        <UButton to="/gate" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">
          <span v-if="gateRoadColor" class="mr-1 inline-block size-2 rounded-full align-middle" :style="{ background: gateRoadColor }" />Gate
        </UButton>
        <UButton to="/guide" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Guide</UButton>
        <UButton to="/about" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">About</UButton>
      </div>

      <div class="pointer-events-auto flex items-center gap-2">
        <template v-if="loggedIn">
          <UButton size="sm" color="primary" icon="i-lucide-map-pin" :disabled="!position && !canManualAddress" @click="openDrop('camp')">
            Drop camp
          </UButton>
          <UButton size="sm" color="neutral" variant="solid" class="bg-[#7c3aed]/85 text-white backdrop-blur-xl" icon="i-lucide-palette" :disabled="!position && !canManualAddress" @click="openDrop('art')">
            Drop art
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

    <!-- layers panel (doubles as the legend) -->
    <div class="pointer-events-auto absolute bottom-4 left-3 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#26211a]/85 text-xs text-white shadow-lg backdrop-blur-xl">
      <button type="button" class="flex w-full items-center gap-1.5 px-3 py-2 font-display font-semibold" @click="panelOpen = !panelOpen">
        <UIcon name="i-lucide-layers" class="size-3.5 text-primary" />Layers
        <UIcon :name="panelOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="ml-auto size-3.5 text-white/60" />
      </button>
      <div v-show="panelOpen" class="space-y-1 px-3 pb-2.5">
        <div class="flex gap-1 rounded-lg bg-white/5 p-0.5">
          <button type="button" class="flex-1 rounded-md py-1 text-[11px] font-medium transition" :class="basemap === 'blocks' ? 'bg-primary text-white' : 'text-white/55 hover:text-white'" @click="basemap = 'blocks'">Blocks</button>
          <button type="button" class="flex-1 rounded-md py-1 text-[11px] font-medium transition" :class="basemap === 'lines' ? 'bg-primary text-white' : 'text-white/55 hover:text-white'" @click="basemap = 'lines'">Streets</button>
        </div>
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

    <!-- weather pill (top-left, below the bar) -->
    <NuxtLink
      v-if="wx"
      to="/live"
      class="pointer-events-auto absolute left-3 top-16 flex items-center gap-2 rounded-full border border-white/10 bg-[#26211a]/85 px-3 py-1.5 text-sm text-white shadow-lg backdrop-blur-xl"
    >
      <UIcon :name="wmo(wx.weather_code).icon" class="size-4 text-primary" />
      <span class="font-medium">{{ Math.round(wx.temperature_2m) }}°</span>
      <span class="text-white/60">{{ Math.round(wx.wind_gusts_10m) }} mph</span>
      <span class="size-2 rounded-full" :style="{ background: dustRisk(wx.wind_gusts_10m).color }" />
    </NuxtLink>

    <!-- compass rose (map orientation is locked to bearing 45°) -->
    <div class="pointer-events-none absolute bottom-20 right-4 sm:bottom-6">
      <CompassRose />
    </div>

    <!-- GPS readout pill (bottom center) -->
    <div class="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
      <div class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#26211a]/85 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
        <UIcon :name="position ? 'i-lucide-navigation' : 'i-lucide-locate-fixed'" class="size-4" :class="position ? 'text-primary' : 'text-white/50'" />
        <span :class="position ? 'font-medium' : 'text-white/60'">
          {{ readout ?? 'Tap the ⌖ to find yourself on the playa' }}
        </span>
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
        </form>
      </template>
    </UModal>

    <!-- drop pin modal -->
    <UModal v-model:open="dropOpen" :title="`Drop my ${dropKind} here`">
      <template #body>
        <form class="space-y-3" @submit.prevent="dropPin">
          <p class="text-sm">
            Location: <b>{{ effectiveAddressNamed ?? '—' }}</b>
            <span v-if="!usingManual && accuracyLabel" class="text-(--ui-text-muted)"> · GPS {{ accuracyLabel }}</span>
            <span v-else-if="usingManual" class="text-(--ui-text-muted)"> · typed</span>
          </p>
          <p v-if="!usingManual && accuracyRough" class="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />
            Rough GPS fix — the street may be off. Move to open sky and re-locate, or double-check before saving.
          </p>
          <div v-if="canManualAddress">
            <UInput v-model="manualAddress" placeholder="Or type an address — e.g. 7:30 & E" class="w-full" />
            <p v-if="manualAddress.trim() && !manualParsed" class="mt-1 text-xs text-red-600">Use “time & street”, e.g. 7:30 & E</p>
          </div>
          <USelect
            v-if="myItems.length"
            v-model="selectedId"
            :items="itemOptions"
            class="w-full"
          />
          <UInput
            v-if="creatingNew"
            v-model="newName"
            :placeholder="dropKind === 'camp' ? 'Camp name' : 'Artwork name'"
            class="w-full"
          />
          <p v-if="dropError" class="text-sm text-red-600">{{ dropError }}</p>
          <UButton type="submit" block :loading="dropBusy" :disabled="(creatingNew && !newName) || !effectiveAddress">
            {{ creatingNew ? `Create ${dropKind} & drop pin` : `Move my ${dropKind} here` }}
          </UButton>
        </form>
      </template>
    </UModal>
  </div>
</template>
