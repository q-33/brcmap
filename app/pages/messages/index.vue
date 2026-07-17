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
const tab = ref<'direct' | 'mesh'>('direct')

// --- Direct (site) messages ---
const { data: convos, status: dmStatus, refresh } = await useFetch<Conversation[]>('/api/messages', { default: () => [] })
const totalUnread = computed(() => (convos.value ?? []).reduce((n, c) => n + c.unread, 0))

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

// --- Mesh (LoRa) chat — shared singleton state, also driven by the map's Mesh control ---
const { connected, status: meshStatus, messages: meshMessages, nodesList, sendText, connect, supported } = useMeshtastic()
const meshDraft = ref('')
const anyMeshTransport = computed(() => supported.ble || supported.serial)
async function sendMesh() {
  const t = meshDraft.value.trim()
  if (!t)
    return
  meshDraft.value = ''
  await sendText(t)
}

useHead({ title: 'Messages — BRC Map' })
</script>

<template>
  <UContainer class="max-w-2xl py-10 sm:py-14">
    <div class="mb-4 flex items-end justify-between gap-3">
      <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Messages</h1>
      <UButton v-if="loggedIn && tab === 'direct'" size="sm" color="primary" icon="i-lucide-pencil" @click="composeOpen = true">
        New message
      </UButton>
    </div>

    <!-- tabs -->
    <div class="mb-5 flex gap-1 rounded-lg bg-(--ui-bg-muted) p-0.5 text-sm">
      <button
        type="button"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition"
        :class="tab === 'direct' ? 'bg-(--ui-bg) shadow-sm' : 'text-(--ui-text-muted)'"
        @click="tab = 'direct'"
      >
        <UIcon name="i-lucide-mail" class="size-4" /> Direct
        <UBadge v-if="totalUnread" color="primary" variant="solid" size="sm">{{ totalUnread }}</UBadge>
      </button>
      <button
        type="button"
        class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 font-medium transition"
        :class="tab === 'mesh' ? 'bg-(--ui-bg) shadow-sm' : 'text-(--ui-text-muted)'"
        @click="tab = 'mesh'"
      >
        <UIcon name="i-lucide-radio" class="size-4" /> Mesh
        <ClientOnly><span v-if="connected" class="size-2 rounded-full bg-green-500" /></ClientOnly>
      </button>
    </div>

    <!-- =================== DIRECT =================== -->
    <template v-if="tab === 'direct'">
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
    </template>

    <!-- =================== MESH =================== -->
    <ClientOnly v-else>
      <div class="rounded-xl border border-(--ui-border)">
        <div class="flex items-center gap-2 border-b border-(--ui-border) px-4 py-2.5">
          <UIcon name="i-lucide-radio-tower" class="size-4 text-primary" />
          <p class="text-sm font-semibold">Mesh chat <span class="font-normal text-(--ui-text-muted)">· off-grid over LoRa</span></p>
          <span class="ml-auto text-xs" :class="connected ? 'text-green-600' : 'text-(--ui-text-muted)'">
            {{ connected ? `connected · ${nodesList.length} nearby` : (meshStatus === 'disconnected' ? 'not connected' : 'connecting…') }}
          </span>
        </div>

        <div class="max-h-[45vh] min-h-40 space-y-1.5 overflow-y-auto p-4 text-sm">
          <p v-if="!meshMessages.length" class="py-8 text-center text-(--ui-text-muted)">
            No mesh messages yet. Messages broadcast to everyone on your Meshtastic channel with no internet.
          </p>
          <p v-for="m in meshMessages" :key="m.id">
            <b class="text-(--ui-text)">{{ m.outbound ? 'You' : (m.fromName || `!${m.from.toString(16)}`) }}:</b>
            <span class="text-(--ui-text-toned)"> {{ m.text }}</span>
          </p>
        </div>

        <div class="border-t border-(--ui-border) p-3">
          <form v-if="connected" class="flex gap-2" @submit.prevent="sendMesh">
            <UInput v-model="meshDraft" placeholder="Message the mesh…" class="flex-1" />
            <UButton type="submit" icon="i-lucide-send" :disabled="!meshDraft.trim()" square aria-label="Send" />
          </form>
          <div v-else class="space-y-2 text-center">
            <p class="text-sm text-(--ui-text-muted)">Connect a Meshtastic radio to chat off-grid.</p>
            <div v-if="anyMeshTransport" class="flex justify-center gap-2">
              <UButton v-if="supported.ble" size="sm" color="primary" variant="soft" icon="i-lucide-bluetooth" @click="connect('ble')">Bluetooth</UButton>
              <UButton v-if="supported.serial" size="sm" color="primary" variant="soft" icon="i-lucide-usb" @click="connect('serial')">USB</UButton>
            </div>
            <p v-else class="text-xs text-(--ui-text-muted)">
              On iPhone, use the Meshtastic app. <NuxtLink to="/guide" class="text-primary underline">Set up your channel →</NuxtLink>
            </p>
          </div>
        </div>
      </div>
      <p class="mt-3 text-center text-xs text-(--ui-text-muted)">
        New to the mesh? <NuxtLink to="/guide" class="text-primary underline">Join the BRC Map mesh</NuxtLink> to get your radio on the same channel.
      </p>
    </ClientOnly>

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
