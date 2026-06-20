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

// camps -> pins
const { data: campsData, refresh: refreshCamps } = await useFetch('/api/camps')
const pins = computed<CampPin[]>(() =>
  (campsData.value ?? []).flatMap((c: any) =>
    (c.locations ?? [])
      .filter((l: any) => l.gpsLatitude != null && l.gpsLongitude != null)
      .map((l: any) => ({ name: c.name, lat: l.gpsLatitude, lng: l.gpsLongitude, address: namedAddress(l.addressString) })),
  ),
)

// live GPS readout
const position = ref<{ lat: number, lng: number }>()
const readout = computed(() => position.value ? describeLatLng(position.value) : null)
function onPosition(p: { lat: number, lng: number }) {
  position.value = p
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

// the current user's own camps (for picking vs creating)
interface MyCamp { id: string, name: string, locations: { addressString: string | null }[] }
const { data: myCamps, refresh: refreshMine } = await useFetch<MyCamp[]>('/api/camps/mine', {
  immediate: false,
  default: () => [],
})
watch(loggedIn, (v) => { if (v) refreshMine() }, { immediate: true })

// drop pin
const dropOpen = ref(false)
const selectedCampId = ref<string>('') // '' = create new
const campName = ref('')
const dropError = ref('')
const dropBusy = ref(false)
const currentAddress = computed(() =>
  position.value ? formatAddress(latLngToAddress(position.value)) : null,
)
const currentAddressNamed = computed(() =>
  position.value ? formatAddressNamed(latLngToAddress(position.value)) : null,
)
const creatingNew = computed(() => selectedCampId.value === '')

async function openDrop() {
  await refreshMine()
  // default to the user's first camp if they have one, else "create new"
  selectedCampId.value = myCamps.value?.[0]?.id ?? ''
  dropOpen.value = true
}

async function dropPin() {
  if (!position.value || !currentAddress.value)
    return
  dropBusy.value = true
  dropError.value = ''
  try {
    let campId = selectedCampId.value
    if (creatingNew.value) {
      const camp: any = await $fetch('/api/camps', {
        method: 'POST',
        body: { name: campName.value, year: CITY_YEAR },
      })
      campId = camp.id
    }
    await $fetch('/api/locations', {
      method: 'POST',
      body: { campId, addressString: currentAddress.value },
    })
    await Promise.all([refreshCamps(), refreshMine()])
    dropOpen.value = false
    campName.value = ''
  }
  catch (e: any) {
    dropError.value = e?.data?.statusMessage ?? 'Could not drop pin'
  }
  finally {
    dropBusy.value = false
  }
}

// camp options for the picker select
const campOptions = computed(() => [
  ...(myCamps.value ?? []).map(c => ({ label: c.name, value: c.id })),
  { label: '+ Create a new camp', value: '' },
])
</script>

<template>
  <div class="relative h-dvh w-dvw overflow-hidden">
    <ClientOnly>
      <PlayaMap :camps="pins" :focus="focus" class="absolute inset-0" @position="onPosition" />
    </ClientOnly>

    <!-- floating top bar -->
    <div class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
      <div class="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#26211a]/85 p-1 pl-3 text-white shadow-lg backdrop-blur-xl">
        <NuxtLink to="/" class="mr-1 flex items-center gap-1.5">
          <UIcon name="i-lucide-flame" class="size-4 text-primary" />
          <span class="font-display text-sm font-bold">BurnerMap</span>
        </NuxtLink>
        <UButton to="/camps" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">Camps</UButton>
        <UButton to="/about" size="xs" color="neutral" variant="ghost" class="text-white/80 hover:text-white">About</UButton>
      </div>

      <div class="pointer-events-auto flex items-center gap-2">
        <template v-if="loggedIn">
          <UButton size="sm" color="primary" icon="i-lucide-map-pin" :disabled="!position" @click="openDrop">
            Drop my camp
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
        <li><span class="mr-1.5 inline-block size-2 rounded-full bg-red-600 align-middle" />The Man · Center Camp</li>
        <li><span class="mr-1.5 inline-block size-2 rounded-full align-middle" style="background:#1d4ed8" />Camps</li>
        <li><span class="mr-1.5 inline-block h-0 w-3 border-t-2 border-dashed align-middle" style="border-color:#c25617" />Trash fence</li>
      </ul>
    </div>

    <!-- GPS readout pill (bottom center) -->
    <div class="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
      <div class="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#26211a]/85 px-4 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
        <UIcon :name="position ? 'i-lucide-navigation' : 'i-lucide-locate-fixed'" class="size-4" :class="position ? 'text-primary' : 'text-white/50'" />
        <span :class="position ? 'font-medium' : 'text-white/60'">
          {{ readout ?? 'Tap the ⌖ to find yourself on the playa' }}
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
    <UModal v-model:open="dropOpen" title="Drop my camp here">
      <template #body>
        <form class="space-y-3" @submit.prevent="dropPin">
          <p class="text-sm">
            Location: <b>{{ currentAddressNamed ?? '—' }}</b>
          </p>
          <USelect
            v-if="myCamps && myCamps.length"
            v-model="selectedCampId"
            :items="campOptions"
            class="w-full"
          />
          <UInput
            v-if="creatingNew"
            v-model="campName"
            placeholder="Camp name"
            class="w-full"
          />
          <p v-if="dropError" class="text-sm text-red-600">{{ dropError }}</p>
          <UButton type="submit" block :loading="dropBusy" :disabled="creatingNew && !campName">
            {{ creatingNew ? 'Create camp & drop pin' : 'Move my camp here' }}
          </UButton>
        </form>
      </template>
    </UModal>
  </div>
</template>
