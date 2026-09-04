<script setup lang="ts">
import { BMIR, SHOUTING_FIRE } from '~~/lib/radio'
import { burnCountdown, upcomingBurn } from '~~/lib/burns'
import { dustRisk, wmo } from '~~/lib/weather'

// The map's top section: what the sky is doing, what is on the radio, and what
// burns next. Three things you check without meaning to.
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

// A live clock, not a load-time snapshot: this map gets left open for hours and
// the countdown has to keep meaning something. Ticks a minute at a time —
// seconds would make a thing that happens at dusk look frantic.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 60_000) })
onBeforeUnmount(() => clearInterval(timer))

const burn = computed(() => {
  const b = upcomingBurn(now.value)
  return b ? { ...b, ...burnCountdown(b, now.value) } : null
})

// The flame answers "how soon" before you have read a word of it: dim while it
// is days out, warming through the afternoon, red and breathing in the last
// hour, and alight while it burns.
const flame = computed(() => {
  const b = burn.value
  if (!b)
    return { class: 'text-white/50', beat: false }
  if (b.phase === 'burning')
    return { class: 'text-orange-400', beat: true }
  const hours = b.ms / 3600_000
  if (hours <= 1)
    return { class: 'text-red-400', beat: true }
  if (hours <= 8)
    return { class: 'text-amber-400', beat: false }
  return { class: 'text-white/50', beat: false }
})
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

    <!-- the next thing to burn -->
    <template v-if="burn">
      <span class="hidden h-4 w-px bg-white/15 sm:block" />
      <NuxtLink
        to="/events"
        class="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-white/10"
        :title="`${burn.name} — ${burn.day}, ${burn.time}${burn.expected ? ' (expected — not officially published)' : ''}`"
      >
        <UIcon
          name="i-lucide-flame"
          class="size-4 shrink-0 transition-colors"
          :class="[flame.class, flame.beat && 'animate-pulse']"
        />
        <span class="truncate font-medium">{{ burn.name }}</span>
        <span
          class="shrink-0 tabular-nums"
          :class="burn.phase === 'burning' ? 'font-semibold text-orange-300' : 'text-white/60'"
        >{{ burn.label }}</span>
        <!-- 'expected' means the schedule is not officially published yet, and
             saying so is the difference between a plan and a promise. -->
        <span v-if="burn.expected" class="hidden shrink-0 text-xs text-white/40 md:inline">(expected)</span>
      </NuxtLink>
    </template>
  </div>
</template>
