<script setup lang="ts">
import { BMIR, SHOUTING_FIRE } from '~~/lib/radio'
import { dustRisk, wmo } from '~~/lib/weather'

// The map's top section: what the sky is doing and what is on the radio.
//
// It stacks UNDER the nav in normal flow rather than at a hand-picked `top-`
// offset. The previous version guessed an offset, which is only right until the
// nav wraps to two lines on a narrow phone — and then the two sit on top of each
// other. Flow layout cannot get that wrong.
//
// Each cell is its own control. The version before this made the entire strip
// one <NuxtLink>, so a tap anywhere along the top of the map navigated away from
// the map.
interface Pill {
  tempF: number
  gustMph: number
  code: number
  source: string
  live: boolean
}
defineProps<{ pill: Pill | null }>()

const { temp: fmtTemp, wind: fmtWind, windUnit } = useUnits()
const { toggle: toggleRadio, isPlaying, isLoading } = useRadio()

</script>

<template>
  <div class="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/10 bg-[#26211a]/85 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
    <!-- weather -->
    <NuxtLink
      v-if="pill"
      to="/live"
      class="flex items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-white/10"
      :title="pill.live ? `${pill.source} — measured on the playa` : 'Forecast model'"
    >
      <UIcon :name="wmo(pill.code).icon" class="size-4 shrink-0 text-primary" />
      <span class="font-medium">{{ fmtTemp(pill.tempF) }}</span>
      <span class="text-white/60">{{ fmtWind(pill.gustMph) }} {{ windUnit }}</span>
      <span class="size-2 shrink-0 rounded-full" :style="{ background: dustRisk(pill.gustMph).color }" />
      <span class="hidden text-white/80 sm:inline">{{ dustRisk(pill.gustMph).label }}</span>
      <span v-if="pill.live" class="relative flex size-1.5" aria-label="live station">
        <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span class="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
      </span>
    </NuxtLink>

    <span v-if="pill" class="hidden h-4 w-px bg-white/15 sm:block" />

    <!-- radio -->
    <div class="flex items-center gap-1">
      <button
        v-for="st in [BMIR, SHOUTING_FIRE]"
        :key="st.key"
        type="button"
        class="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition hover:bg-white/10"
        :aria-label="isPlaying(st) ? `Stop ${st.name}` : `Listen to ${st.name} ${st.dial}`"
        @click="toggleRadio(st)"
      >
        <UIcon
          :name="isLoading(st) ? 'i-lucide-loader-circle' : isPlaying(st) ? 'i-lucide-pause' : 'i-lucide-radio'"
          :class="['size-4 shrink-0 text-primary', isLoading(st) && 'animate-spin']"
        />
        <span class="font-medium">{{ st.name }}</span>
        <span v-if="isPlaying(st)" class="flex items-end gap-0.5" aria-hidden="true">
          <span
            v-for="(h, i) in [7, 11, 5]" :key="i"
            class="w-0.5 animate-pulse rounded-full bg-emerald-400"
            :style="{ height: `${h}px`, animationDelay: `${i * 140}ms` }"
          />
        </span>
      </button>
    </div>

  </div>
</template>
