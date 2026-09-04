<script setup lang="ts">
import type { RadioStation } from '~~/lib/radio'

// Play/stop for one station, pointed at the app-wide player. Deliberately not an
// <audio controls> element: those belong to the page that renders them and die
// with it, which is exactly the bug this replaced. There is nothing to scrub on
// a live stream anyway — play, stop, and how loud your phone is.
const props = defineProps<{ station: RadioStation }>()
const { toggle, isPlaying, isLoading, state } = useRadio()
const active = computed(() => isPlaying(props.station) || isLoading(props.station))
const err = computed(() => state.value.key === props.station.key ? state.value.error : null)
</script>

<template>
  <div class="mt-3">
    <UButton
      :color="active ? 'neutral' : 'primary'"
      :variant="active ? 'subtle' : 'solid'"
      :icon="isLoading(station) ? 'i-lucide-loader-circle' : isPlaying(station) ? 'i-lucide-square' : 'i-lucide-play'"
      :ui="{ leadingIcon: isLoading(station) ? 'animate-spin' : '' }"
      :aria-label="isPlaying(station) ? `Stop ${station.name}` : `Play ${station.name}`"
      @click="toggle(station)"
    >
      {{ isPlaying(station) ? 'Stop' : isLoading(station) ? 'Tuning in…' : 'Listen' }}
    </UButton>
    <span v-if="isPlaying(station)" class="ml-2 inline-flex items-end gap-0.5 align-middle" aria-hidden="true">
      <span
        v-for="(h, i) in [7, 11, 5]" :key="i"
        class="w-0.5 animate-pulse rounded-full bg-emerald-500"
        :style="{ height: `${h}px`, animationDelay: `${i * 140}ms` }"
      />
    </span>
    <p v-if="err" class="mt-2 text-xs text-amber-600 dark:text-amber-500">{{ err }}</p>
  </div>
</template>
