<script setup lang="ts">
import type { AudioTrack } from '~~/lib/art/audioTour'
import { TOUR_EXTRAS, TOUR_TRACKS, audioUrl } from '~~/lib/art/audioTour'

// Play the whole tour, in the order Burning Man numbered it: the introduction,
// all 86 narrated artworks, then the theme talk.
//
// One <audio> element that advances on `ended`, rather than 88 that somebody has
// to keep tapping. The individual per-artwork players pause every other audio
// element when they start, so pressing play on a single piece takes over from
// this cleanly — and this stops rather than fighting it, because `ended` is the
// only thing that advances the queue.
const QUEUE: AudioTrack[] = [...TOUR_EXTRAS, ...TOUR_TRACKS].sort((a, b) => a.n - b.n)

const el = ref<HTMLAudioElement | null>(null)
const index = ref(0)
const playing = ref(false)
const loading = ref(false)
const failed = ref(false)

const current = computed(() => QUEUE[index.value] ?? null)
const src = computed(() => (current.value ? audioUrl(current.value) : ''))

function label(t: AudioTrack): string {
  if (t.n === 0)
    return 'Introduction'
  if (t.n === 87)
    return 'The Theme — Axis Mundi'
  return `${t.n}. ${t.title}`
}

async function start() {
  const a = el.value
  if (!a)
    return
  failed.value = false
  // Anything else playing should stop; two narrators at once helps nobody.
  for (const other of document.querySelectorAll('audio')) {
    if (other !== a)
      (other as HTMLAudioElement).pause()
  }
  try {
    loading.value = true
    await a.play()
  }
  catch {
    failed.value = true
  }
  finally {
    loading.value = false
  }
}

function toggle() {
  if (playing.value)
    el.value?.pause()
  else
    start()
}

async function go(to: number) {
  if (to < 0 || to >= QUEUE.length)
    return
  index.value = to
  await nextTick()
  el.value?.load()
  start()
}

function onEnded() {
  if (index.value < QUEUE.length - 1)
    go(index.value + 1)
  else
    playing.value = false
}
</script>

<template>
  <div class="rounded-xl border border-primary/25 bg-(--ui-bg)/60 p-3">
    <audio
      ref="el"
      :src="src"
      preload="none"
      @play="playing = true"
      @pause="playing = false"
      @ended="onEnded"
      @error="failed = true; loading = false"
    />

    <div class="flex items-center gap-3">
      <UButton
        :icon="loading ? 'i-lucide-loader-circle' : playing ? 'i-lucide-pause' : 'i-lucide-play'"
        :class="loading && 'animate-spin'"
        color="primary"
        size="md"
        :aria-label="playing ? 'Pause the tour' : 'Play the whole tour'"
        @click="toggle"
      />
      <div class="min-w-0 flex-1">
        <p class="font-semibold text-(--ui-text)">
          {{ playing || index > 0 ? 'Playing the tour' : 'Play the whole tour' }}
        </p>
        <p class="truncate text-xs text-(--ui-text-muted)">
          <template v-if="playing || index > 0">
            {{ label(current!) }} · {{ index + 1 }} of {{ QUEUE.length }}
          </template>
          <template v-else>
            All {{ QUEUE.length }} tracks in order, start to finish
          </template>
        </p>
      </div>
      <div v-if="playing || index > 0" class="flex shrink-0 items-center gap-0.5">
        <UButton
          icon="i-lucide-skip-back"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="index === 0"
          aria-label="Previous track"
          @click="go(index - 1)"
        />
        <UButton
          icon="i-lucide-skip-forward"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="index >= QUEUE.length - 1"
          aria-label="Next track"
          @click="go(index + 1)"
        />
      </div>
    </div>

    <p v-if="failed" class="mt-2 text-xs text-red-600">
      Couldn't play that track. Skip ahead, or try again.
    </p>
  </div>
</template>
