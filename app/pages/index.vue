<script setup lang="ts">
import { CITY_YEAR, describeLatLng, formatAddress, formatAddressNamed, latLngToAddress, parseAddress } from '~~/lib/brc/geocode'

function namedAddress(s: string | null | undefined): string {
  if (!s)
    return ''
  const a = parseAddress(s)
  return a ? formatAddressNamed(a) : s
}

interface CampPin { name: string, lat: number, lng: number, address: string }

definePageMeta({ layout: false })

const { loggedIn, user, fetch: refreshSession } = useUserSession()

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
  dropError.value = ''
  dropOpen.value = true
}

async function dropPin() {
  if (!position.value || !currentAddress.value)
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
      ? { campId: id, addressString: currentAddress.value }
      : { artId: id, addressString: currentAddress.value }
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
        <PlayaMap :camps="pins" :art-pins="artPins" :focus="focus" class="size-full" @position="onPosition" />
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
        <UButton to="/guide" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Guide</UButton>
        <UButton to="/about" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">About</UButton>
      </div>

      <div class="pointer-events-auto flex items-center gap-2">
        <template v-if="loggedIn">
          <UButton size="sm" color="primary" icon="i-lucide-map-pin" :disabled="!position" @click="openDrop('camp')">
            Drop camp
          </UButton>
          <UButton size="sm" color="neutral" variant="solid" class="bg-[#7c3aed]/85 text-white backdrop-blur-xl" icon="i-lucide-palette" :disabled="!position" @click="openDrop('art')">
            Drop art
          </UButton>
          <UButton size="sm" color="neutral" variant="solid" class="bg-[#26211a]/85 text-white backdrop-blur-xl" icon="i-lucide-user" @click="logout">
            <span class="hidden sm:inline">{{ user?.displayName || 'Log out' }}</span>
          </UButton>
        </template>
        <UButton v-else size="sm" color="primary" @click="authOpen = true">
          Log in
        </UButton>
      </div>
    </div>

    <!-- legend (bottom-left) -->
    <div class="pointer-events-none absolute bottom-4 left-3 hidden rounded-xl border border-white/10 bg-[#26211a]/85 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-xl sm:block">
      <p class="mb-1 font-display font-semibold">Black Rock City {{ CITY_YEAR }}</p>
      <ul class="space-y-0.5 text-white/80">
        <li><span class="mr-1.5 inline-block size-2 rounded-full align-middle" style="background:#27a3df" />Camp blocks</li>
        <li><span class="mr-1.5 inline-block size-2 rounded-full align-middle" style="background:#d6336c" />Camps</li>
        <li><span class="mr-1.5 inline-block size-2 rounded-full align-middle" style="background:#7c3aed" />Art</li>
        <li><span class="mr-1.5 inline-block size-2 rounded-full bg-white align-middle" />The Man · Center Camp</li>
        <li class="!mt-1.5 border-t border-white/10 pt-1.5 font-medium text-white/60">Services</li>
        <li><span class="mr-1.5 inline-block size-2 rounded-full align-middle" style="background:#dc2626" />Medical</li>
        <li><span class="mr-1.5 inline-block size-2 rounded-full align-middle" style="background:#2563eb" />Rangers · safety</li>
        <li><span class="mr-1.5 inline-block size-2 rounded-full align-middle" style="background:#0e7490" />Ice · info · DPW</li>
        <li><span class="mr-1.5 inline-block size-2 rounded-full align-middle" style="background:#d97706" />Airport · gate · fuel</li>
        <li><span class="mr-1.5 inline-block h-0 w-3 border-t-2 border-dashed align-middle" style="border-color:#e1241a" />Trash fence</li>
      </ul>
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
            Location: <b>{{ currentAddressNamed ?? '—' }}</b>
            <span v-if="accuracyLabel" class="text-(--ui-text-muted)"> · GPS {{ accuracyLabel }}</span>
          </p>
          <p v-if="accuracyRough" class="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />
            Rough GPS fix — the street may be off. Move to open sky and re-locate, or double-check before saving.
          </p>
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
          <UButton type="submit" block :loading="dropBusy" :disabled="creatingNew && !newName">
            {{ creatingNew ? `Create ${dropKind} & drop pin` : `Move my ${dropKind} here` }}
          </UButton>
        </form>
      </template>
    </UModal>
  </div>
</template>
