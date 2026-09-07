<script setup lang="ts">
// The Resto tool: mark MOOP where you stand, see what's near you, mark it
// swept. Built for a phone in one dusty hand — GPS does the locating, the
// categories are big buttons, and nothing needs an account.
import { MOOP_CATEGORIES, moopCategory } from '~~/lib/moop'
import { describeLatLng } from '~~/lib/brc/geocode'
import { distanceMeters, bearingDeg, fmtDistance } from '~~/lib/rides'
import { windDir } from '~~/lib/weather'

interface Pin {
  id: string
  lat: number
  lng: number
  category: string
  note: string | null
  status: 'open' | 'cleaned'
  cleanedAt: string | null
  createdAt: string
}

const { data: pins, refresh } = await useFetch<Pin[]>('/api/moop', { server: false, lazy: true, default: () => [] })

let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => { poll = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60_000) })
onBeforeUnmount(() => clearInterval(poll))

// --- where I stand ----------------------------------------------------------
const myPos = ref<{ lat: number, lng: number, accuracy: number } | null>(null)
const geoErr = ref('')
let geoWatch: number | undefined
onMounted(() => {
  if (!('geolocation' in navigator)) {
    geoErr.value = 'No GPS in this browser.'
    return
  }
  geoWatch = navigator.geolocation.watchPosition(
    p => (myPos.value = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
    () => (geoErr.value = 'Location is off — allow it to mark MOOP where you stand.'),
    { enableHighAccuracy: true, maximumAge: 5_000 },
  )
})
onBeforeUnmount(() => { if (geoWatch !== undefined) navigator.geolocation.clearWatch(geoWatch) })

const myAddress = computed(() => (myPos.value ? describeLatLng(myPos.value) : null))

// --- mark -------------------------------------------------------------------
const note = ref('')
const busy = ref('')
const msg = ref('')
async function mark(categoryKey: string) {
  if (!myPos.value)
    return
  busy.value = categoryKey
  msg.value = ''
  try {
    await $fetch('/api/moop', {
      method: 'POST',
      body: { lat: myPos.value.lat, lng: myPos.value.lng, category: categoryKey, note: note.value },
    })
    note.value = ''
    msg.value = 'Pinned. Thank you — a sweep will find it.'
    await refresh()
  }
  catch (e: any) {
    msg.value = e?.data?.statusMessage ?? 'Could not pin that — try again.'
  }
  finally {
    busy.value = ''
  }
}

// --- the line's view --------------------------------------------------------
const open = computed(() => (pins.value ?? []).filter(p => p.status === 'open'))
const cleaned = computed(() => (pins.value ?? []).filter(p => p.status === 'cleaned'))
const nearest = computed(() => {
  const me = myPos.value
  const list = open.value.map(p => ({
    ...p,
    dist: me ? distanceMeters(me, p) : null,
    dir: me ? windDir(bearingDeg(me, p)) : null,
  }))
  return me ? list.sort((a, b) => (a.dist! - b.dist!)) : list
})

const rowBusy = ref('')
async function setStatus(p: Pin, status: 'open' | 'cleaned') {
  rowBusy.value = p.id
  try { await $fetch(`/api/moop/${p.id}`, { method: 'PATCH', body: { status } }); await refresh() }
  finally { rowBusy.value = '' }
}

function rel(ts: string): string {
  const mins = Math.round((Date.now() - Date.parse(ts)) / 60_000)
  if (mins < 60)
    return mins < 1 ? 'just now' : `${mins} min ago`
  const h = Math.round(mins / 60)
  return h < 48 ? `${h} h ago` : new Date(ts).toLocaleDateString()
}

useHead({ title: 'Resto — BRC Map' })
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-14">
    <div class="mb-2 flex items-end justify-between gap-3">
      <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Resto</h1>
      <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton>
    </div>
    <p class="mb-6 text-(--ui-text-muted)">
      The city is gone; the sweep remains. Standing on MOOP? Pin it — anonymously, no
      account — and a line can find it. Leave No Trace is a group project.
    </p>

    <!-- mark here -->
    <UCard class="mb-6">
      <p class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">Mark MOOP where I stand</p>
      <p class="mt-1 text-sm">
        <template v-if="myPos">
          <UIcon name="i-lucide-crosshair" class="mr-1 inline size-4 text-primary" />{{ myAddress }}
          <span class="text-xs text-(--ui-text-muted)">(±{{ Math.round(myPos.accuracy) }} m)</span>
        </template>
        <span v-else class="text-(--ui-text-muted)">{{ geoErr || 'Getting your position…' }}</span>
      </p>
      <div class="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        <UButton
          v-for="c in MOOP_CATEGORIES" :key="c.key"
          :disabled="!myPos" :loading="busy === c.key"
          color="neutral" variant="soft" class="justify-start"
          @click="mark(c.key)"
        >
          <UIcon :name="c.icon" class="size-4 shrink-0" :style="{ color: c.color }" />
          <span class="truncate">{{ c.label }}</span>
        </UButton>
      </div>
      <UInput v-model="note" class="mt-2 w-full" placeholder="Optional note (e.g. 'buried carpet, NE corner of block')" />
      <p v-if="msg" class="mt-2 text-sm" :class="msg.startsWith('Pinned') ? 'text-(--ui-text-toned)' : 'text-amber-600 dark:text-amber-500'">{{ msg }}</p>
      <p class="mt-2 text-xs text-(--ui-text-muted)">
        Anonymous. The pin is the spot you're standing on, so stand on the MOOP.
      </p>
    </UCard>

    <!-- open pins, nearest first -->
    <section class="mb-6">
      <h2 class="mb-2 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">
        Open pins ({{ open.length }})<template v-if="myPos"> — nearest first</template>
      </h2>
      <div v-if="nearest.length" class="space-y-1.5">
        <UCard v-for="p in nearest.slice(0, 60)" :key="p.id">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="flex items-center gap-1.5 text-sm">
                <UIcon :name="moopCategory(p.category).icon" class="size-4 shrink-0" :style="{ color: moopCategory(p.category).color }" />
                <span class="font-medium">{{ moopCategory(p.category).label }}</span>
                <span v-if="p.dist != null" class="text-(--ui-text-muted)">· {{ fmtDistance(p.dist) }} {{ p.dir }}</span>
              </p>
              <p class="mt-0.5 truncate text-xs text-(--ui-text-muted)">
                {{ describeLatLng(p) }} · {{ rel(p.createdAt) }}
              </p>
              <p v-if="p.note" class="mt-1 truncate text-xs text-(--ui-text-toned)">{{ p.note }}</p>
            </div>
            <UButton size="xs" color="neutral" variant="soft" class="shrink-0" :loading="rowBusy === p.id" icon="i-lucide-check" @click="setStatus(p, 'cleaned')">
              Swept
            </UButton>
          </div>
        </UCard>
      </div>
      <p v-else class="py-8 text-center text-sm text-(--ui-text-muted)">
        No open pins. Either the playa is clean, or nobody has looked yet.
      </p>
    </section>

    <!-- the line's progress -->
    <section v-if="cleaned.length" class="mb-6">
      <h2 class="mb-2 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">
        Swept in the last day ({{ cleaned.length }})
      </h2>
      <ul class="space-y-1">
        <li v-for="p in cleaned.slice(0, 30)" :key="p.id" class="flex items-center gap-2 text-sm text-(--ui-text-muted)">
          <UIcon name="i-lucide-check" class="size-4 shrink-0 text-emerald-600" />
          <span class="truncate">{{ moopCategory(p.category).label }} · {{ describeLatLng(p) }}</span>
          <UButton size="xs" variant="ghost" color="neutral" class="ml-auto shrink-0" :loading="rowBusy === p.id" @click="setStatus(p, 'open')">Still there</UButton>
        </li>
      </ul>
    </section>

    <p class="text-xs text-(--ui-text-muted)">
      This is a community layer, not the official MOOP Map — that one is Resto's, built
      from their own line sweeps. But every pin here is one less surprise for them.
    </p>
  </UContainer>
</template>
