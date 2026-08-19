<script setup lang="ts">
import type { AudioTrack } from '~~/lib/art/audioTour'
import { audioUrl } from '~~/lib/art/audioTour'

// A single Art Audio Tour track.
//
// preload="none" on purpose: the Art page can carry 80+ of these, and letting
// browsers reach for metadata on all of them would pull megabytes on a page you
// might only be scrolling. Nothing is fetched until Play.
const props = defineProps<{ track: AudioTrack, compact?: boolean }>()

const el = ref<HTMLAudioElement | null>(null)
const playing = ref(false)
const loading = ref(false)
const failed = ref(false)
const elapsed = ref(0)
const total = ref(0)

const src = computed(() => audioUrl(props.track))

function mmss(s: number): string {
  if (!Number.isFinite(s) || s < 0)
    return '--:--'
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

async function toggle() {
  const a = el.value
  if (!a)
    return
  failed.value = false
  if (playing.value) {
    a.pause()
    return
  }
  // Pause any other track first — two narrators at once helps nobody.
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

function seek(e: Event) {
  const a = el.value
  if (a && Number.isFinite(total.value))
    a.currentTime = Number((e.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <audio
      ref="el"
      :src="src"
      preload="none"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false; elapsed = 0"
      @timeupdate="elapsed = el?.currentTime ?? 0"
      @loadedmetadata="total = el?.duration ?? 0"
      @error="failed = true; loading = false"
    />
    <UButton
      :icon="loading ? 'i-lucide-loader-circle' : playing ? 'i-lucide-pause' : 'i-lucide-play'"
      :class="loading && 'animate-spin'"
      color="primary"
      :variant="compact ? 'ghost' : 'soft'"
      :size="compact ? 'xs' : 'sm'"
      :aria-label="`${playing ? 'Pause' : 'Play'} audio guide for ${track.title}`"
      @click.stop.prevent="toggle"
    />
    <template v-if="!compact">
      <input
        type="range"
        min="0"
        :max="total || 0"
        :value="elapsed"
        step="1"
        class="min-w-0 flex-1 accent-primary"
        :disabled="!total"
        aria-label="Seek"
        @input="seek"
      >
      <span class="shrink-0 font-mono text-xs tabular-nums text-(--ui-text-muted)">
        {{ mmss(elapsed) }} / {{ mmss(total) }}
      </span>
    </template>
    <span v-else class="text-xs text-(--ui-text-muted)">Audio guide</span>
    <span v-if="failed" class="text-xs text-red-600">Couldn’t play</span>
  </div>
</template>
