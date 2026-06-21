<script setup lang="ts">
import { formatAddressNamed, parseAddress } from '~~/lib/brc/geocode'

interface EventRow {
  id: string
  ownerId: string | null
  campId: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  camp: { id: string, name: string, locations: { addressString: string | null, createdAt: string }[] }
}

const { loggedIn, user } = useUserSession()

const { data: events, refresh } = await useFetch<EventRow[]>('/api/events')

// playa wall-clock formatting (no timezone conversion — parse the string parts)
function parts(s: string) {
  // Postgres returns "2026-09-02 05:30:00" (space) — normalize to ISO-ish first.
  const [datePart = '', timePart = '00:00'] = s.replace(' ', 'T').split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)
  const date = new Date(y!, mo! - 1, d!, h!, mi!)
  const day = date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  const hour12 = ((h! + 11) % 12) + 1
  const time = `${hour12}:${String(mi).padStart(2, '0')} ${h! < 12 ? 'AM' : 'PM'}`
  return { dayKey: datePart!, day, time }
}

function campAddress(e: EventRow): string | null {
  const loc = [...(e.camp.locations ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
  if (!loc?.addressString)
    return null
  const a = parseAddress(loc.addressString)
  return a ? formatAddressNamed(a) : loc.addressString
}

// group events by day
const grouped = computed(() => {
  const groups: { day: string, dayKey: string, items: EventRow[] }[] = []
  for (const e of events.value ?? []) {
    const p = parts(e.startsAt)
    let g = groups.find(x => x.dayKey === p.dayKey)
    if (!g) {
      g = { day: p.day, dayKey: p.dayKey, items: [] }
      groups.push(g)
    }
    g.items.push(e)
  }
  return groups
})

// --- Post an event ---
interface MyCamp { id: string, name: string }
const { data: myCamps, refresh: refreshMine } = await useFetch<MyCamp[]>('/api/camps/mine', { immediate: false, default: () => [] })
watch(loggedIn, v => v && refreshMine(), { immediate: true })

const open = ref(false)
const busy = ref(false)
const err = ref('')
const form = reactive({ campId: '', title: '', description: '', startsAt: '', endsAt: '' })
const campOptions = computed(() => (myCamps.value ?? []).map(c => ({ label: c.name, value: c.id })))

async function openPost() {
  await refreshMine()
  form.campId = myCamps.value?.[0]?.id ?? ''
  open.value = true
}

async function submit() {
  busy.value = true
  err.value = ''
  try {
    await $fetch('/api/events', { method: 'POST', body: { ...form, description: form.description || undefined, endsAt: form.endsAt || undefined } })
    await refresh()
    open.value = false
    form.title = ''
    form.description = ''
    form.startsAt = ''
    form.endsAt = ''
  }
  catch (e: any) {
    err.value = e?.data?.statusMessage ?? 'Could not post event'
  }
  finally {
    busy.value = false
  }
}

async function remove(id: string) {
  await $fetch(`/api/events/${id}`, { method: 'DELETE' }).catch(() => {})
  await refresh()
}

useHead({ title: 'Events — BurnerMap' })
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Events</h1>
        <p class="mt-1 text-(--ui-text-muted)">What camps have planned on the playa.</p>
      </div>
      <UButton v-if="loggedIn" color="primary" icon="i-lucide-plus" @click="openPost">
        Post an event
      </UButton>
      <UButton v-else to="/?login=1" color="primary" variant="soft">
        Log in to post
      </UButton>
    </div>

    <div v-if="grouped.length" class="space-y-8">
      <section v-for="g in grouped" :key="g.dayKey">
        <h2 class="font-display mb-3 text-lg font-semibold uppercase tracking-wide text-primary">{{ g.day }}</h2>
        <div class="space-y-3">
          <UCard v-for="e in g.items" :key="e.id">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-semibold">{{ e.title }}</p>
                <p class="mt-0.5 text-sm text-(--ui-text-muted)">
                  <span class="text-primary">{{ parts(e.startsAt).time }}</span>
                  <span v-if="e.endsAt"> – {{ parts(e.endsAt).time }}</span>
                  · hosted by <b class="text-(--ui-text)">{{ e.camp.name }}</b>
                  <span v-if="campAddress(e)"> · 📍 {{ campAddress(e) }}</span>
                </p>
                <p v-if="e.description" class="mt-2 text-sm text-(--ui-text-toned)">{{ e.description }}</p>
              </div>
              <UButton
                v-if="user?.id && e.ownerId === user.id"
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="remove(e.id)"
              />
            </div>
          </UCard>
        </div>
      </section>
    </div>

    <div v-else class="py-16 text-center text-(--ui-text-muted)">
      <UIcon name="i-lucide-calendar" class="mx-auto mb-3 size-10 opacity-40" />
      <p>No upcoming events yet.</p>
      <p v-if="loggedIn" class="mt-1 text-sm">Be the first — post one for your camp.</p>
    </div>

    <UModal v-model:open="open" title="Post an event">
      <template #body>
        <form v-if="myCamps && myCamps.length" class="space-y-3" @submit.prevent="submit">
          <USelect v-model="form.campId" :items="campOptions" placeholder="Hosting camp" class="w-full" />
          <UInput v-model="form.title" placeholder="Event title" class="w-full" />
          <UTextarea v-model="form.description" placeholder="Description (optional)" :rows="3" class="w-full" />
          <div class="grid grid-cols-2 gap-3">
            <label class="text-xs text-(--ui-text-muted)">Starts
              <UInput v-model="form.startsAt" type="datetime-local" class="mt-1 w-full" />
            </label>
            <label class="text-xs text-(--ui-text-muted)">Ends (optional)
              <UInput v-model="form.endsAt" type="datetime-local" class="mt-1 w-full" />
            </label>
          </div>
          <p v-if="err" class="text-sm text-red-600">{{ err }}</p>
          <UButton type="submit" block :loading="busy" :disabled="!form.campId || !form.title || !form.startsAt">
            Post event
          </UButton>
        </form>
        <div v-else class="text-center text-sm text-(--ui-text-muted)">
          <p>You need a camp first.</p>
          <UButton to="/" color="primary" variant="soft" class="mt-3">Add your camp on the map</UButton>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
