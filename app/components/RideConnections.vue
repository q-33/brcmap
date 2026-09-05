<script setup lang="ts">
import { distanceMeters, bearingDeg, fmtAge, fmtDistance } from '~~/lib/rides'
import { windDir } from '~~/lib/weather'

// The rendezvous panel: pending requests to accept, and active connections
// showing where the other person is right now.
//
// Consent is the spine of this thing:
//   · nothing is shared while a request is pending — accepting is the switch
//   · sharing runs ONLY while this page is open (a browser tab cannot follow
//     anyone home, and we would not want it to)
//   · either side taps Stop and both positions are deleted server-side that
//     moment — the system remembers where people ARE, never where they were
interface Conn {
  id: string
  status: 'pending' | 'active' | 'ended'
  iAmOwner: boolean
  ride: { id: string, kind: string, destination: string, departs: string | null, status: string } | null
  other: { id: string, name: string } | null
  otherPos: { lat: number, lng: number, at: string | null } | null
  updatedAt: string
}

const emit = defineEmits<{ changed: [] }>()
const { data: conns, refresh } = await useFetch<Conn[]>('/api/rides/connections', { server: false, lazy: true })

const pendingMine = computed(() => (conns.value ?? []).filter(c => c.status === 'pending' && c.iAmOwner))
const pendingTheirs = computed(() => (conns.value ?? []).filter(c => c.status === 'pending' && !c.iAmOwner))
const active = computed(() => (conns.value ?? []).filter(c => c.status === 'active'))

// --- my own position: one browser watch, shared by every active connection ---
const myPos = ref<{ lat: number, lng: number } | null>(null)
const geoDenied = ref(false)
let geoWatch: number | undefined
let pushTimer: ReturnType<typeof setInterval> | undefined
let pollTimer: ReturnType<typeof setInterval> | undefined

function startGeo() {
  if (geoWatch !== undefined || !('geolocation' in navigator))
    return
  geoWatch = navigator.geolocation.watchPosition(
    (p) => { myPos.value = { lat: p.coords.latitude, lng: p.coords.longitude } },
    () => { geoDenied.value = true },
    { enableHighAccuracy: true, maximumAge: 10_000 },
  )
}
function stopGeo() {
  if (geoWatch !== undefined)
    navigator.geolocation.clearWatch(geoWatch)
  geoWatch = undefined
}

// Push my fix to every active connection every 20s — GPS-cheap, hotspot-cheap,
// and plenty for two people converging on foot or by art car.
async function pushPositions() {
  if (!myPos.value || document.visibilityState !== 'visible')
    return
  for (const c of active.value)
    $fetch(`/api/rides/connections/${c.id}/position`, { method: 'POST', body: myPos.value }).catch(() => {})
}

watch(active, (a) => {
  if (a.length) {
    startGeo()
  }
  else {
    stopGeo()
    myPos.value = null
  }
}, { immediate: false })

onMounted(() => {
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 15_000)
  pushTimer = setInterval(pushPositions, 20_000)
})
onBeforeUnmount(() => {
  clearInterval(pollTimer)
  clearInterval(pushTimer)
  stopGeo()
})

const busy = ref('')
async function setStatus(c: Conn, status: 'active' | 'ended') {
  busy.value = c.id
  try {
    await $fetch(`/api/rides/connections/${c.id}`, { method: 'PATCH', body: { status } })
    await refresh()
    emit('changed')
    // accepting starts my side immediately rather than on the next tick
    if (status === 'active') {
      startGeo()
      setTimeout(pushPositions, 1500)
    }
  }
  finally {
    busy.value = ''
  }
}

const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => { tick = setInterval(() => { now.value = Date.now() }, 5000) })
onBeforeUnmount(() => clearInterval(tick))

function whereabouts(c: Conn): string {
  if (!c.otherPos)
    return 'waiting for their first fix…'
  const parts: string[] = []
  if (myPos.value) {
    const d = distanceMeters(myPos.value, c.otherPos)
    parts.push(`${fmtDistance(d)} ${windDir(bearingDeg(myPos.value, c.otherPos))} of you`)
  }
  else {
    parts.push(`${c.otherPos.lat.toFixed(4)}, ${c.otherPos.lng.toFixed(4)}`)
  }
  if (c.otherPos.at)
    parts.push(fmtAge(now.value - Date.parse(c.otherPos.at)))
  return parts.join(' · ')
}

defineExpose({ refresh })
</script>

<template>
  <section v-if="pendingMine.length || pendingTheirs.length || active.length" class="mb-8 space-y-4">
    <!-- requests on my posts -->
    <div v-if="pendingMine.length">
      <h2 class="mb-2 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">Wants to connect</h2>
      <div class="space-y-2">
        <UCard v-for="c in pendingMine" :key="c.id">
          <div class="flex items-center justify-between gap-3">
            <p class="min-w-0 truncate text-sm">
              <span class="font-medium">{{ c.other?.name }}</span>
              <span class="text-(--ui-text-muted)"> · on your “{{ c.ride?.destination }}” post</span>
            </p>
            <div class="flex shrink-0 gap-1.5">
              <UButton size="xs" color="primary" :loading="busy === c.id" @click="setStatus(c, 'active')">Accept &amp; share location</UButton>
              <UButton size="xs" color="neutral" variant="ghost" :loading="busy === c.id" @click="setStatus(c, 'ended')">Decline</UButton>
            </div>
          </div>
          <p class="mt-1.5 text-xs text-(--ui-text-muted)">
            Accepting shares your live location with {{ c.other?.name }} — and theirs with you — while this page is open, until either of you stops.
          </p>
        </UCard>
      </div>
    </div>

    <!-- live rendezvous -->
    <div v-if="active.length">
      <h2 class="mb-2 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">Finding each other</h2>
      <div class="space-y-2">
        <UCard v-for="c in active" :key="c.id" class="border-primary/30">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm">
                <span class="relative mr-1 inline-flex size-2" aria-hidden="true">
                  <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span class="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span class="font-medium">{{ c.other?.name }}</span>
                <span class="text-(--ui-text-muted)"> · {{ c.ride?.destination }}</span>
              </p>
              <p class="mt-1 text-sm text-(--ui-text-toned)">{{ whereabouts(c) }}</p>
              <p v-if="c.other" class="mt-1 text-xs">
                <NuxtLink :to="`/messages/${c.other.id}`" class="text-primary underline">Message {{ c.other.name }}</NuxtLink>
              </p>
            </div>
            <UButton size="xs" color="neutral" variant="soft" class="shrink-0" :loading="busy === c.id" @click="setStatus(c, 'ended')">
              Stop sharing
            </UButton>
          </div>
        </UCard>
      </div>
      <p v-if="geoDenied" class="mt-2 text-xs text-amber-600 dark:text-amber-500">
        Location permission is off, so they can't see you — but you can still see them.
        Allow location for this site to share your side.
      </p>
      <p v-else class="mt-2 text-xs text-(--ui-text-muted)">
        Sharing runs only while this page is open. Stop sharing deletes both positions immediately.
      </p>
    </div>

    <!-- my outgoing asks -->
    <div v-if="pendingTheirs.length">
      <h2 class="mb-2 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">Waiting on</h2>
      <ul class="space-y-1.5">
        <li v-for="c in pendingTheirs" :key="c.id" class="flex items-center gap-2 text-sm text-(--ui-text-muted)">
          <UIcon name="i-lucide-clock" class="size-4 shrink-0" />
          <span class="truncate">{{ c.other?.name }} · {{ c.ride?.destination }}</span>
          <UButton size="xs" variant="ghost" color="neutral" class="ml-auto shrink-0" :loading="busy === c.id" @click="setStatus(c, 'ended')">Withdraw</UButton>
        </li>
      </ul>
    </div>
  </section>
</template>
