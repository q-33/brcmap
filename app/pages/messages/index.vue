<script setup lang="ts">
interface Conversation {
  userId: string
  displayName: string | null
  playaName: string | null
  lastBody: string
  lastAt: string
  lastFromMe: boolean
  unread: number
}
interface CampHit { id: string, name: string, owner: { id: string, displayName: string | null } | null }

const { loggedIn } = useUserSession()

// --- Direct (site) messages ---
const { data: convos, status: dmStatus, refresh } = await useFetch<Conversation[]>('/api/messages', { default: () => [] })

function name(c: Conversation): string {
  return c.displayName || c.playaName || 'Burner'
}
function rel(ts: string): string {
  const mins = Math.round((Date.now() - +new Date(ts)) / 60000)
  if (!Number.isFinite(mins))
    return ''
  if (mins < 1)
    return 'now'
  if (mins < 60)
    return `${mins}m`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs}h` : new Date(ts).toLocaleDateString()
}

// --- New message: search camps → message the owner ---
const composeOpen = ref(false)
const q = ref('')
const debouncedQ = ref('')
let qTimer: ReturnType<typeof setTimeout> | undefined
watch(q, (v) => {
  clearTimeout(qTimer)
  qTimer = setTimeout(() => (debouncedQ.value = v.trim()), 250)
})
// client-only: the camp search only matters once the compose modal is open.
const { data: campHits, status: searchStatus } = await useFetch<CampHit[]>('/api/camps', {
  query: { q: debouncedQ },
  server: false,
  lazy: true,
  default: () => [],
})
const recipients = computed(() => {
  const seen = new Set<string>()
  const out: { ownerId: string, ownerName: string, campName: string }[] = []
  for (const c of campHits.value ?? []) {
    if (!c.owner?.id)
      continue
    const key = `${c.owner.id}:${c.name}`
    if (seen.has(key))
      continue
    seen.add(key)
    out.push({ ownerId: c.owner.id, ownerName: c.owner.displayName || 'Burner', campName: c.name })
  }
  return out.slice(0, 20)
})
watch(composeOpen, (o) => {
  if (o) {
    q.value = ''
    debouncedQ.value = ''
  }
})

useHead({ title: 'Messages — BRC Map' })
</script>

<template>
  <UContainer class="max-w-2xl py-10 sm:py-14">
    <div class="mb-4 flex items-end justify-between gap-3">
      <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Messages</h1>
      <UButton v-if="loggedIn" size="sm" color="primary" icon="i-lucide-pencil" @click="composeOpen = true">
        New message
      </UButton>
    </div>

    <!-- direct (site) messages -->
    <div v-if="!loggedIn" class="rounded-xl border border-(--ui-border) p-6 text-center text-(--ui-text-muted)">
      <p>Please <NuxtLink to="/?login=1" class="text-primary underline">log in</NuxtLink> to see your messages.</p>
    </div>

    <div v-else-if="convos.length" class="divide-y divide-(--ui-border) overflow-hidden rounded-xl border border-(--ui-border)">
      <NuxtLink
        v-for="c in convos"
        :key="c.userId"
        :to="`/messages/${c.userId}`"
        class="flex items-center gap-3 px-4 py-3 transition hover:bg-(--ui-bg-muted)"
      >
        <div class="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--ui-bg-muted) font-semibold uppercase">
          {{ name(c).charAt(0) }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <p class="truncate font-medium" :class="c.unread ? 'text-(--ui-text-highlighted)' : ''">{{ name(c) }}</p>
            <span class="shrink-0 text-xs text-(--ui-text-muted)">{{ rel(c.lastAt) }}</span>
          </div>
          <p class="truncate text-sm text-(--ui-text-muted)">
            <span v-if="c.lastFromMe" class="text-(--ui-text-dimmed)">You: </span>{{ c.lastBody }}
          </p>
        </div>
        <UBadge v-if="c.unread" color="primary" variant="solid" size="sm" class="shrink-0">{{ c.unread }}</UBadge>
      </NuxtLink>
    </div>

    <div v-else-if="dmStatus !== 'pending'" class="py-16 text-center text-(--ui-text-muted)">
      <UIcon name="i-lucide-mail" class="mx-auto mb-3 size-10 opacity-40" />
      <p>No conversations yet.</p>
      <p class="mt-1 text-sm">Tap <b>New message</b> to reach a camp organizer, or “Message the organizer” on any camp/artwork.</p>
    </div>

    <!-- compose modal -->
    <UModal v-model:open="composeOpen" title="New message">
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-(--ui-text-muted)">Search for a camp to message its organizer.</p>
          <UInput v-model="q" icon="i-lucide-search" placeholder="Camp name…" autofocus class="w-full" />
          <div class="max-h-72 divide-y divide-(--ui-border) overflow-y-auto rounded-lg border border-(--ui-border)">
            <NuxtLink
              v-for="r in recipients"
              :key="`${r.ownerId}:${r.campName}`"
              :to="`/messages/${r.ownerId}`"
              class="flex items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-(--ui-bg-muted)"
              @click="composeOpen = false"
            >
              <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--ui-bg-muted) text-xs font-semibold uppercase">
                {{ r.ownerName.charAt(0) }}
              </div>
              <div class="min-w-0">
                <p class="truncate font-medium">{{ r.ownerName }}</p>
                <p class="truncate text-xs text-(--ui-text-muted)">runs {{ r.campName }}</p>
              </div>
              <UIcon name="i-lucide-chevron-right" class="ml-auto size-4 text-(--ui-text-muted)" />
            </NuxtLink>
            <p v-if="!recipients.length" class="px-3 py-6 text-center text-sm text-(--ui-text-muted)">
              {{ searchStatus === 'pending' ? 'Searching…' : (debouncedQ ? 'No camps found.' : 'Type a camp name to search.') }}
            </p>
          </div>
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
