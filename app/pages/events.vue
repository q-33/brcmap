<script setup lang="ts">
import { formatAddressNamed, parseAddress } from '~~/lib/brc/geocode'
import { MAJOR_BURNS } from '~~/lib/burns'

interface EventRow {
  id: string
  ownerId: string | null
  campId: string | null
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  camp: { id: string, name: string, locations: { addressString: string | null, createdAt: string }[] } | null
}

const { loggedIn, user } = useUserSession()
const { isAdmin } = useMe()

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
  if (!e.camp)
    return null
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
// One time span (start/end), applied to any number of selected dates → one event
// per date. Lets a camp post a recurring thing without re-entering everything.
const form = reactive({ campId: '', title: '', description: '', startTime: '', endTime: '' })
const dates = ref<string[]>([])
const newDate = ref('')
const campOptions = computed(() => {
  const opts = (myCamps.value ?? []).map(c => ({ label: c.name, value: c.id }))
  // Admins can post an "official" event with no hosting camp.
  return isAdmin.value ? [{ label: 'No camp — official event', value: '' }, ...opts] : opts
})

function addDate() {
  const d = newDate.value
  if (d && !dates.value.includes(d))
    dates.value = [...dates.value, d].sort()
  newDate.value = ''
}
function removeDate(d: string) {
  dates.value = dates.value.filter(x => x !== d)
}
function nextDay(d: string): string {
  const dt = new Date(`${d}T00:00`)
  dt.setDate(dt.getDate() + 1)
  return dt.toISOString().slice(0, 10)
}
function dayLabel(d: string): string {
  return new Date(`${d}T00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function resetForm() {
  form.title = ''
  form.description = ''
  form.startTime = ''
  form.endTime = ''
  dates.value = []
  newDate.value = ''
}

async function openPost() {
  await refreshMine()
  resetForm()
  form.campId = myCamps.value?.[0]?.id ?? ''
  err.value = ''
  open.value = true
}

// Clone: prefill the form from an existing event (camp, title, desc, time span,
// and its date) so the user can tweak the dates and re-post.
function cloneEvent(e: EventRow) {
  form.campId = e.campId ?? ''
  form.title = e.title
  form.description = e.description ?? ''
  const [sd = '', st = ''] = e.startsAt.replace(' ', 'T').split('T')
  form.startTime = st.slice(0, 5)
  form.endTime = e.endsAt ? e.endsAt.replace(' ', 'T').split('T')[1]!.slice(0, 5) : ''
  dates.value = sd ? [sd] : []
  newDate.value = ''
  err.value = ''
  open.value = true
}

async function submit() {
  if ((!form.campId && !isAdmin.value) || !form.title || !form.startTime || !dates.value.length)
    return
  busy.value = true
  err.value = ''
  try {
    for (const d of dates.value) {
      const startsAt = `${d}T${form.startTime}`
      let endsAt: string | undefined
      if (form.endTime) {
        // an end time earlier than the start rolls into the next day
        const endDate = form.endTime <= form.startTime ? nextDay(d) : d
        endsAt = `${endDate}T${form.endTime}`
      }
      await $fetch('/api/events', { method: 'POST', body: { campId: form.campId || undefined, title: form.title, description: form.description || undefined, startsAt, endsAt } })
    }
    await refresh()
    open.value = false
    resetForm()
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

    <!-- Major burns — curated headline burns, highlighted at the top -->
    <section v-if="MAJOR_BURNS.length" class="mb-8 overflow-hidden rounded-2xl border border-red-700/25 bg-red-700/[0.055]">
      <div class="flex items-center gap-2 border-b border-red-700/15 px-4 py-2.5 sm:px-5">
        <UIcon name="i-lucide-flame" class="size-5 text-red-700 dark:text-red-400" />
        <h2 class="font-display text-base font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">Major Burns</h2>
      </div>
      <ul class="divide-y divide-red-700/10">
        <li v-for="b in MAJOR_BURNS" :key="b.name" class="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <div class="min-w-0">
            <p class="font-semibold text-(--ui-text)">{{ b.name }}</p>
            <p class="mt-0.5 text-sm text-(--ui-text-muted)">
              {{ b.day }} · <span class="font-medium text-red-700 dark:text-red-400">{{ b.time }}</span>
              <span v-if="b.expected"> (expected)</span>
            </p>
          </div>
          <UIcon name="i-lucide-flame" class="size-5 shrink-0 text-red-700/60 dark:text-red-400/60" />
        </li>
      </ul>
    </section>

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
                  <template v-if="e.camp"> · hosted by <b class="text-(--ui-text)">{{ e.camp.name }}</b>
                    <span v-if="campAddress(e)"> · 📍 {{ campAddress(e) }}</span>
                  </template>
                  <span v-else class="font-medium text-primary"> · Official</span>
                </p>
                <p v-if="e.description" class="mt-2 text-sm text-(--ui-text-toned)">{{ e.description }}</p>
              </div>
              <div v-if="user?.id && e.ownerId === user.id" class="flex shrink-0 gap-0.5">
                <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" aria-label="Clone event" @click="cloneEvent(e)" />
                <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="xs" aria-label="Delete event" @click="remove(e.id)" />
              </div>
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
        <form v-if="(myCamps && myCamps.length) || isAdmin" class="space-y-3" @submit.prevent="submit">
          <USelect v-model="form.campId" :items="campOptions" :placeholder="isAdmin ? 'Hosting camp (optional)' : 'Hosting camp'" class="w-full" />
          <UInput v-model="form.title" placeholder="Event title" class="w-full" />
          <UTextarea v-model="form.description" placeholder="Description (optional)" :rows="3" class="w-full" />
          <div class="grid grid-cols-2 gap-3">
            <label class="text-xs text-(--ui-text-muted)">Start time
              <UInput v-model="form.startTime" type="time" class="mt-1 w-full" />
            </label>
            <label class="text-xs text-(--ui-text-muted)">End time (optional)
              <UInput v-model="form.endTime" type="time" class="mt-1 w-full" />
            </label>
          </div>
          <div>
            <p class="mb-1 text-xs text-(--ui-text-muted)">Dates — add one or more (an event is created for each)</p>
            <div class="flex gap-2">
              <UInput v-model="newDate" type="date" class="w-full" @keydown.enter.prevent="addDate" />
              <UButton color="neutral" variant="soft" icon="i-lucide-plus" :disabled="!newDate" @click="addDate">Add</UButton>
            </div>
            <div v-if="dates.length" class="mt-2 flex flex-wrap gap-1.5">
              <UButton v-for="d in dates" :key="d" size="xs" color="primary" variant="subtle" trailing-icon="i-lucide-x" @click="removeDate(d)">
                {{ dayLabel(d) }}
              </UButton>
            </div>
          </div>
          <p v-if="err" class="text-sm text-red-600">{{ err }}</p>
          <UButton type="submit" block :loading="busy" :disabled="(!form.campId && !isAdmin) || !form.title || !form.startTime || !dates.length">
            {{ dates.length > 1 ? `Post ${dates.length} events` : 'Post event' }}
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
