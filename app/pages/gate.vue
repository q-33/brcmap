<script setup lang="ts">
import type { GateDirection, GateStatus } from '~~/lib/gate'
import { GATE_DIRECTIONS, GATE_STATUSES, GATE_STATUS_META } from '~~/lib/gate'

interface Condition {
  id: string
  direction: GateDirection
  status: GateStatus
  waitLabel: string | null
  note: string | null
  createdAt: string
  updatedBy?: { displayName: string | null } | null
}
interface GateData { inbound: Condition | null, exodus: Condition | null, history: Condition[] }

const { loggedIn } = useUserSession()
const { isGpe } = useMe()

const { data, refresh, status } = await useFetch<GateData>('/api/gate')

function rel(ts: string): string {
  const d = new Date(ts)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (!Number.isFinite(mins))
    return ''
  if (mins < 1)
    return 'just now'
  if (mins < 60)
    return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24)
    return `${hrs} hr ago`
  return d.toLocaleDateString()
}

const current = computed(() => GATE_DIRECTIONS.map(d => ({ dir: d, cond: data.value?.[d.key] ?? null })))

// GPE update form
const statusItems = GATE_STATUSES.map(s => ({ label: GATE_STATUS_META[s].label, value: s }))
const dirItems = GATE_DIRECTIONS.map(d => ({ label: d.label, value: d.key }))
const form = reactive<{ direction: GateDirection, status: GateStatus, waitLabel: string, note: string }>({
  direction: 'inbound',
  status: 'open',
  waitLabel: '',
  note: '',
})
const busy = ref(false)
const err = ref('')
const saved = ref(false)

async function submit() {
  busy.value = true
  err.value = ''
  saved.value = false
  try {
    await $fetch('/api/gate', { method: 'POST', body: { ...form } })
    saved.value = true
    form.note = ''
    await refresh()
  }
  catch (e: any) {
    err.value = e?.data?.statusMessage ?? 'Could not post update'
  }
  finally {
    busy.value = false
  }
}

useHead({ title: 'Gate Road — BRC Map' })
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-14">
    <div class="mb-2 flex items-end justify-between gap-3">
      <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Gate Road</h1>
      <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">Refresh</UButton>
    </div>
    <p class="mb-8 text-(--ui-text-muted)">
      Live traffic on the way in and out of Black Rock City, posted by the GPE crew
      (Gate, Perimeter &amp; Exodus). Conditions change fast — check before you roll.
    </p>

    <!-- current conditions -->
    <div class="grid gap-4 sm:grid-cols-2">
      <UCard v-for="{ dir, cond } in current" :key="dir.key">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-lg font-semibold uppercase tracking-wide">{{ dir.short }}</h2>
          <span
            class="rounded-full px-2.5 py-0.5 text-sm font-semibold text-white"
            :style="{ background: cond ? GATE_STATUS_META[cond.status].color : '#9ca3af' }"
          >
            {{ cond ? GATE_STATUS_META[cond.status].label : 'No data' }}
          </span>
        </div>
        <p class="mt-1 text-sm text-(--ui-text-muted)">{{ dir.label }}</p>
        <template v-if="cond">
          <p v-if="cond.waitLabel" class="mt-3 text-2xl font-bold">{{ cond.waitLabel }}<span class="ml-1 text-sm font-normal text-(--ui-text-muted)">wait</span></p>
          <p class="mt-1 text-sm text-(--ui-text-toned)">{{ GATE_STATUS_META[cond.status].desc }}</p>
          <p v-if="cond.note" class="mt-2 rounded-md bg-(--ui-bg-muted) px-2 py-1.5 text-sm">{{ cond.note }}</p>
          <p class="mt-3 text-xs text-(--ui-text-muted)">
            Updated {{ rel(cond.createdAt) }}<template v-if="cond.updatedBy?.displayName"> · {{ cond.updatedBy.displayName }}</template>
          </p>
        </template>
        <p v-else class="mt-3 text-sm text-(--ui-text-muted)">No conditions posted yet.</p>
      </UCard>
    </div>

    <!-- GPE update form -->
    <UCard v-if="isGpe" class="mt-8 border-primary/30">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-megaphone" class="size-5 text-primary" />
          <h2 class="font-display font-semibold uppercase tracking-wide">Post an update</h2>
          <UBadge color="primary" variant="subtle" size="xs">GPE</UBadge>
        </div>
      </template>
      <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="submit">
        <USelect v-model="form.direction" :items="dirItems" class="w-full" />
        <USelect v-model="form.status" :items="statusItems" class="w-full" />
        <UInput v-model="form.waitLabel" placeholder="Wait estimate (e.g. 2–4 hours)" class="w-full" />
        <UInput v-model="form.note" placeholder="Note (optional)" class="w-full" />
        <div class="sm:col-span-2 flex items-center gap-3">
          <UButton type="submit" :loading="busy">Post update</UButton>
          <span v-if="saved" class="text-sm text-(--ui-text-muted)">Posted ✓</span>
          <span v-if="err" class="text-sm text-red-600">{{ err }}</span>
        </div>
      </form>
    </UCard>
    <p v-else-if="!loggedIn" class="mt-8 text-sm text-(--ui-text-muted)">
      GPE crew: <NuxtLink to="/?login=1" class="text-primary underline">log in</NuxtLink> to post conditions.
    </p>

    <!-- history -->
    <section v-if="data?.history?.length" class="mt-10">
      <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">Recent updates</h2>
      <ul class="space-y-1.5">
        <li v-for="h in data.history" :key="h.id" class="flex items-center gap-2 text-sm">
          <span class="inline-block size-2.5 shrink-0 rounded-full" :style="{ background: GATE_STATUS_META[h.status].color }" />
          <span class="font-medium capitalize">{{ h.direction }}</span>
          <span>{{ GATE_STATUS_META[h.status].label }}</span>
          <span v-if="h.waitLabel" class="text-(--ui-text-muted)">· {{ h.waitLabel }}</span>
          <span class="ml-auto text-xs text-(--ui-text-muted)">{{ rel(h.createdAt) }}</span>
        </li>
      </ul>
    </section>
  </UContainer>
</template>
