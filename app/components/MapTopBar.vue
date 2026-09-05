<script setup lang="ts">
import { BMIR, K_HOLE, SHOUTING_FIRE } from '~~/lib/radio'
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

// dustRisk() colours were picked as dot fills on light surfaces; as TEXT on
// this dark glass the calm green and warning red both muddy out. Same scale,
// lifted for legibility — the mapping lives here because it is about this
// surface, not about the risk.
const DUST_TEXT: Record<string, string> = {
  '#16a34a': '#4ade80', // calm
  '#65a30d': '#a3e635', // breezy
  '#d97706': '#fbbf24', // dusty
  '#dc2626': '#f87171', // high
}
const dustText = (c: string) => DUST_TEXT[c] ?? c

</script>

<template>
  <!-- inline-flex, not flex: the pill is exactly as wide as what is in it. As a
       growing flex child it stretched the whole width of the nav row and left a
       long empty tail of dark glass over the city. -->
  <div class="pointer-events-auto inline-flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-white/10 bg-[#26211a]/85 px-3 py-2 text-sm text-white shadow-lg backdrop-blur-xl">
    <!-- weather. Everything here earns its ink:
           · the dust read is a WORD tinted with its risk colour, not a dot
             beside a word saying the same thing;
           · where the number came from is said in text — "· BRC NOC" for a
             sensor inside the fence, "· forecast" for the model — because a
             1.5px green dot meant "live station" only to whoever wrote it. -->
    <NuxtLink
      v-if="pill"
      to="/live"
      class="flex items-center gap-2 rounded-md px-1 py-0.5 transition hover:bg-white/10"
      :title="pill.live ? `${pill.source} — measured on the playa` : 'Forecast model, not a local sensor'"
    >
      <UIcon :name="wmo(pill.code).icon" class="size-4 shrink-0 text-primary" />
      <span class="font-medium">{{ fmtTemp(pill.tempF) }}</span>
      <span class="text-white/60">{{ fmtWind(pill.gustMph) }} {{ windUnit }}</span>
      <span class="font-medium" :style="{ color: dustText(dustRisk(pill.gustMph).color) }">{{ dustRisk(pill.gustMph).label }}</span>
      <span class="hidden items-center gap-1 text-xs text-white/45 sm:flex">
        · {{ pill.live ? pill.source : 'forecast' }}
        <span v-if="pill.live" class="relative flex size-1.5" aria-label="measured on the playa">
          <span class="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span class="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
        </span>
      </span>
    </NuxtLink>

    <span v-if="pill" class="hidden h-4 w-px bg-white/15 sm:block" />

    <!-- radio -->
    <div class="flex items-center gap-1">
      <button
        v-for="st in [BMIR, SHOUTING_FIRE, K_HOLE]"
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
