<script setup lang="ts">
// The rideshare board. Offers ("driving to Reno Sunday, 2 seats") and requests
// ("need a ride to SF, one duffel"), connected through the in-app messages —
// this page only introduces people; the arranging happens in their inbox.
interface Ride {
  id: string
  kind: 'offer' | 'request'
  destination: string
  departs: string | null
  seats: number | null
  luggage: string | null
  fromLocation: string | null
  note: string | null
  status: 'open' | 'closed'
  createdAt: string
  mine: boolean
  owner: { id: string, displayName: string | null, playaName: string | null } | null
}

const { loggedIn } = useUserSession()
const { data: rides, refresh, status } = await useFetch<Ride[]>('/api/rides')

const tab = ref<'all' | 'offer' | 'request'>('all')
const open = computed(() => (rides.value ?? []).filter(r => r.status === 'open'))
const shown = computed(() => open.value.filter(r => tab.value === 'all' || r.kind === tab.value))
const mineClosed = computed(() => (rides.value ?? []).filter(r => r.mine && r.status === 'closed'))

// --- post a ride -------------------------------------------------------------
const form = reactive({
  kind: 'offer' as 'offer' | 'request',
  destination: '',
  departs: '',
  seats: null as number | null,
  luggage: '',
  fromLocation: '',
  note: '',
})
const busy = ref(false)
const err = ref('')
const formOpen = ref(false)

// Prefill "where are you now" from the poster's own camp — that is exactly the
// address this field wants, and most people will not know it from memory.
async function openForm(kind: 'offer' | 'request') {
  form.kind = kind
  err.value = ''
  formOpen.value = true
  if (!form.fromLocation && loggedIn.value) {
    try {
      const mine = await $fetch<{ name: string, locations?: { addressString: string | null }[] }[]>('/api/camps/mine')
      const c = mine?.[0]
      const addr = c?.locations?.[0]?.addressString
      if (c)
        form.fromLocation = addr ? `${addr} — ${c.name}` : c.name
    }
    catch { /* prefill only; the field stays editable either way */ }
  }
}

async function submit() {
  busy.value = true
  err.value = ''
  try {
    await $fetch('/api/rides', { method: 'POST', body: { ...form } })
    formOpen.value = false
    form.destination = ''
    form.note = ''
    await refresh()
  }
  catch (e: any) {
    err.value = e?.data?.statusMessage ?? 'Could not post — check the fields and try again.'
  }
  finally {
    busy.value = false
  }
}

const rowBusy = ref('')
async function setStatus(r: Ride, s: 'open' | 'closed') {
  rowBusy.value = r.id
  try { await $fetch(`/api/rides/${r.id}`, { method: 'PATCH', body: { status: s } }); await refresh() }
  finally { rowBusy.value = '' }
}
async function remove(r: Ride) {
  rowBusy.value = r.id
  try { await $fetch(`/api/rides/${r.id}`, { method: 'DELETE' }); await refresh() }
  finally { rowBusy.value = '' }
}

function rel(ts: string): string {
  const mins = Math.round((Date.now() - Date.parse(ts)) / 60000)
  if (!Number.isFinite(mins) || mins < 1)
    return 'just now'
  if (mins < 60)
    return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24)
    return `${hrs} hr ago`
  return new Date(ts).toLocaleDateString()
}

const posterName = (r: Ride) => r.owner?.playaName || r.owner?.displayName || 'A burner'

useHead({ title: 'Rideshares — BRC Map' })
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-14">
    <div class="mb-2 flex items-end justify-between gap-3">
      <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Rideshares</h1>
      <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">Refresh</UButton>
    </div>
    <p class="mb-6 text-(--ui-text-muted)">
      Empty seats and burners who need them. Post an offer or a request, then arrange the
      details over <NuxtLink to="/messages" class="text-primary underline">messages</NuxtLink> —
      say where you're headed, when, and how much stuff is coming with you.
    </p>

    <!-- post -->
    <div class="mb-8 flex flex-wrap gap-2">
      <template v-if="loggedIn">
        <UButton icon="i-lucide-car" @click="openForm('offer')">Offer a ride</UButton>
        <UButton icon="i-lucide-hand" color="neutral" variant="soft" @click="openForm('request')">Find a ride</UButton>
      </template>
      <p v-else class="text-sm text-(--ui-text-muted)">
        <NuxtLink to="/?login=1" class="text-primary underline">Log in</NuxtLink> to post — rides are
        arranged through in-app messages, which need an account.
      </p>
    </div>

    <UModal v-model:open="formOpen" :title="form.kind === 'offer' ? 'Offer a ride' : 'Find a ride'">
      <template #body>
        <form class="space-y-3" @submit.prevent="submit">
          <UInput v-model="form.destination" class="w-full" :placeholder="form.kind === 'offer' ? 'Where are you driving? (e.g. Reno airport, SF Bay Area)' : 'Where do you need to go?'" />
          <UInput v-model="form.departs" class="w-full" placeholder="When? (e.g. Sunday morning, after Temple burn)" />
          <UInput
            v-if="form.kind === 'offer'"
            :model-value="form.seats ?? undefined" type="number" min="1" max="12" class="w-full"
            placeholder="Seats available"
            @update:model-value="v => form.seats = v ? Number(v) : null"
          />
          <UInput v-else v-model="form.luggage" class="w-full" placeholder="How much stuff? (e.g. one duffel + a bike)" />
          <UInput v-model="form.fromLocation" class="w-full" placeholder="Where are you now? (e.g. 7:30 & E — Camp Foo)" />
          <UTextarea v-model="form.note" :rows="3" class="w-full" placeholder="Anything else — costs split, no glitter…" />
          <p v-if="err" class="text-sm text-error">{{ err }}</p>
          <div class="flex gap-2">
            <UButton type="submit" :loading="busy" :disabled="!form.destination.trim()">Post</UButton>
            <UButton variant="ghost" color="neutral" @click="formOpen = false">Cancel</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <!-- filter -->
    <div class="mb-4 flex gap-1 text-sm">
      <UButton v-for="t in (['all', 'offer', 'request'] as const)" :key="t" size="xs"
        :color="tab === t ? 'primary' : 'neutral'" :variant="tab === t ? 'solid' : 'ghost'" @click="tab = t"
      >
        {{ t === 'all' ? `All (${open.length})` : t === 'offer' ? 'Rides offered' : 'Rides wanted' }}
      </UButton>
    </div>

    <!-- board -->
    <div v-if="shown.length" class="space-y-2">
      <UCard v-for="r in shown" :key="r.id">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="flex flex-wrap items-center gap-x-2 text-sm">
              <UBadge :color="r.kind === 'offer' ? 'primary' : 'neutral'" variant="subtle" size="sm">
                {{ r.kind === 'offer' ? 'Offering' : 'Looking' }}
              </UBadge>
              <span class="font-semibold">{{ r.destination }}</span>
              <span v-if="r.departs" class="text-(--ui-text-muted)">· {{ r.departs }}</span>
            </p>
            <p class="mt-1 text-xs text-(--ui-text-muted)">
              {{ posterName(r) }}
              <template v-if="r.fromLocation"> · at {{ r.fromLocation }}</template>
              <template v-if="r.kind === 'offer' && r.seats"> · {{ r.seats }} seat{{ r.seats === 1 ? '' : 's' }}</template>
              <template v-if="r.kind === 'request' && r.luggage"> · bringing {{ r.luggage }}</template>
              · {{ rel(r.createdAt) }}
            </p>
            <p v-if="r.note" class="mt-2 whitespace-pre-line rounded-md bg-(--ui-bg-muted) px-2.5 py-1.5 text-sm">{{ r.note }}</p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1.5">
            <template v-if="r.mine">
              <UButton size="xs" color="neutral" variant="soft" :loading="rowBusy === r.id" @click="setStatus(r, 'closed')">
                {{ r.kind === 'offer' ? 'Car is full' : 'Found a ride' }}
              </UButton>
              <UButton size="xs" color="neutral" variant="ghost" :loading="rowBusy === r.id" @click="remove(r)">Delete</UButton>
            </template>
            <UButton v-else-if="loggedIn && r.owner" :to="`/messages/${r.owner.id}`" size="xs" icon="i-lucide-mail">Message</UButton>
            <UButton v-else-if="!loggedIn" to="/?login=1" size="xs" variant="subtle" icon="i-lucide-mail">Log in to message</UButton>
          </div>
        </div>
      </UCard>
    </div>
    <p v-else class="py-10 text-center text-sm text-(--ui-text-muted)">
      Nothing on the board{{ tab !== 'all' ? ' in this view' : ' yet' }} — be the first.
    </p>

    <!-- the poster's own closed posts, so "found a ride" doesn't erase history -->
    <section v-if="mineClosed.length" class="mt-10">
      <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">Your closed posts</h2>
      <ul class="space-y-1.5">
        <li v-for="r in mineClosed" :key="r.id" class="flex items-center gap-2 text-sm text-(--ui-text-muted)">
          <UIcon name="i-lucide-check" class="size-4 shrink-0 text-(--ui-text-muted)/60" />
          <span class="truncate">{{ r.destination }}<template v-if="r.departs"> · {{ r.departs }}</template></span>
          <span class="ml-auto flex shrink-0 gap-1">
            <UButton size="xs" variant="ghost" color="neutral" :loading="rowBusy === r.id" @click="setStatus(r, 'open')">Reopen</UButton>
            <UButton size="xs" variant="ghost" color="neutral" :loading="rowBusy === r.id" @click="remove(r)">Delete</UButton>
          </span>
        </li>
      </ul>
    </section>
  </UContainer>
</template>
