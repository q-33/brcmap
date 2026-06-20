<script setup lang="ts">
import { describeLatLng, formatAddress, latLngToAddress } from '~~/lib/brc/geocode'

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
      .map((l: any) => ({ name: c.name, lat: l.gpsLatitude, lng: l.gpsLongitude, address: l.addressString })),
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

// drop pin
const dropOpen = ref(false)
const campName = ref('')
const dropError = ref('')
const dropBusy = ref(false)
const currentAddress = computed(() =>
  position.value ? formatAddress(latLngToAddress(position.value)) : null,
)

async function dropPin() {
  if (!position.value || !currentAddress.value)
    return
  dropBusy.value = true
  dropError.value = ''
  try {
    const camp: any = await $fetch('/api/camps', {
      method: 'POST',
      body: { name: campName.value, year: new Date().getFullYear() },
    })
    await $fetch('/api/locations', {
      method: 'POST',
      body: { campId: camp.id, addressString: currentAddress.value },
    })
    await refreshCamps()
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
</script>

<template>
  <div class="relative h-dvh w-dvw overflow-hidden">
    <ClientOnly>
      <PlayaMap :camps="pins" :focus="focus" class="absolute inset-0" @position="onPosition" />
    </ClientOnly>

    <!-- top bar -->
    <div class="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
      <div class="rounded-lg bg-white/90 px-3 py-2 shadow backdrop-blur">
        <div class="flex items-center gap-2">
          <p class="text-sm font-bold">BurnerMap</p>
          <NuxtLink to="/camps" class="text-xs text-primary underline">Camps</NuxtLink>
        </div>
        <p class="text-xs text-(--ui-text-muted)">
          {{ readout ?? 'tap the ⌖ to find yourself' }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <template v-if="loggedIn">
          <UButton size="sm" color="primary" :disabled="!position" @click="dropOpen = true">
            Drop my camp
          </UButton>
          <UButton size="sm" variant="soft" @click="logout">
            {{ user?.displayName || 'Log out' }}
          </UButton>
        </template>
        <UButton v-else size="sm" color="primary" @click="authOpen = true">
          Log in
        </UButton>
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
            Location: <b>{{ currentAddress ?? '—' }}</b>
          </p>
          <UInput v-model="campName" placeholder="Camp name" required class="w-full" />
          <p v-if="dropError" class="text-sm text-red-600">{{ dropError }}</p>
          <UButton type="submit" block :loading="dropBusy" :disabled="!campName">
            Drop pin
          </UButton>
        </form>
      </template>
    </UModal>
  </div>
</template>
