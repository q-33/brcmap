<script setup lang="ts">
import { safeGetItem, safeSetItem } from '~~/lib/safeStorage'

// One-time announcement for the rideshare board, on the map because that is the
// homepage. Dismissible, and stays dismissed — an announcement that keeps
// re-announcing is an ad. Client-only state so SSR renders nothing and there is
// no hydration flicker.
const KEY = 'brcmap:ridesAnnounced'
const show = ref(false)
onMounted(() => { show.value = safeGetItem(KEY) !== '1' })
function dismiss() {
  show.value = false
  safeSetItem(KEY, '1')
}
</script>

<template>
  <div v-if="show" class="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-xl border border-primary/40 bg-[#26211a]/90 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
    <UIcon name="i-lucide-car" class="size-4 shrink-0 text-primary" />
    <NuxtLink to="/rides" class="min-w-0 truncate hover:underline" @click="dismiss">
      <span class="font-semibold">New — Rideshares:</span>
      offer a seat or find one for the ride home
    </NuxtLink>
    <button type="button" class="shrink-0 rounded-full p-0.5 text-white/60 transition hover:bg-white/10 hover:text-white" aria-label="Dismiss" @click="dismiss">
      <UIcon name="i-lucide-x" class="size-3.5" />
    </button>
  </div>
</template>
