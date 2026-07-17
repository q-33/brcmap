<script setup lang="ts">
import { dustRisk, windDir, wmo } from '~~/lib/weather'

interface Current {
  temperature_2m: number
  apparent_temperature: number
  relative_humidity_2m: number
  weather_code: number
  wind_speed_10m: number
  wind_gusts_10m: number
  wind_direction_10m: number
  is_day: number
}
interface Day {
  date: string
  code: number
  max: number
  min: number
  windMax: number
  gustMax: number
  precip: number
  sunrise: string
  sunset: string
}
interface Weather { current: Current | null, days: Day[], updatedAt: string }

const { data, refresh, status } = await useFetch<Weather>('/api/weather')

const cur = computed(() => data.value?.current ?? null)
const curWmo = computed(() => cur.value ? wmo(cur.value.weather_code) : null)
const dust = computed(() => cur.value ? dustRisk(cur.value.wind_gusts_10m) : null)

function dayName(d: string, i: number) {
  if (i === 0)
    return 'Today'
  return new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'short' })
}
function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

// BMIR streams only during the event window (Aug 30 – Sep 7, 2026).
const BMIR_STREAM = 'https://stream.revma.ihrhls.com/zc8378'

useHead({ title: 'Live — BRC Map' })
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-14">
    <div class="mb-2 flex items-end justify-between gap-3">
      <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Live on Playa</h1>
      <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">Refresh</UButton>
    </div>
    <p class="mb-8 text-(--ui-text-muted)">Weather, dust outlook, and radio for Black Rock City.</p>

    <!-- current weather -->
    <UCard v-if="cur">
      <div class="flex items-center gap-5">
        <UIcon :name="curWmo?.icon ?? 'i-lucide-cloud'" class="size-14 shrink-0 text-primary" />
        <div class="flex-1">
          <p class="font-display text-5xl font-bold leading-none">{{ Math.round(cur.temperature_2m) }}°</p>
          <p class="mt-1 text-(--ui-text-muted)">{{ curWmo?.label }} · feels {{ Math.round(cur.apparent_temperature) }}°</p>
        </div>
        <span
          v-if="dust"
          class="rounded-full px-3 py-1 text-sm font-semibold text-white"
          :style="{ background: dust.color }"
        >{{ dust.label }}</span>
      </div>
      <div class="mt-5 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Wind</p>
          <p class="font-semibold">{{ Math.round(cur.wind_speed_10m) }} mph {{ windDir(cur.wind_direction_10m) }}</p>
        </div>
        <div class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Gusts</p>
          <p class="font-semibold">{{ Math.round(cur.wind_gusts_10m) }} mph</p>
        </div>
        <div class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Humidity</p>
          <p class="font-semibold">{{ cur.relative_humidity_2m }}%</p>
        </div>
        <div v-if="data?.days?.[0]" class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Sun</p>
          <p class="font-semibold">{{ clockTime(data.days[0].sunrise) }} – {{ clockTime(data.days[0].sunset) }}</p>
        </div>
      </div>
    </UCard>
    <UCard v-else>
      <p class="text-sm text-(--ui-text-muted)">Weather is unavailable right now.</p>
    </UCard>

    <!-- forecast -->
    <section v-if="data?.days?.length" class="mt-8">
      <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">7-day forecast</h2>
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        <div v-for="(d, i) in data.days" :key="d.date" class="rounded-xl border border-(--ui-border) p-3 text-center">
          <p class="text-xs font-semibold">{{ dayName(d.date, i) }}</p>
          <UIcon :name="wmo(d.code).icon" class="mx-auto my-1.5 size-7 text-primary" />
          <p class="text-sm"><b>{{ Math.round(d.max) }}°</b> <span class="text-(--ui-text-muted)">{{ Math.round(d.min) }}°</span></p>
          <p class="mt-1 text-xs" :style="{ color: dustRisk(d.gustMax).color }">{{ Math.round(d.gustMax) }} mph</p>
          <p v-if="d.precip > 5" class="text-xs text-(--ui-text-muted)">{{ d.precip }}% 🌧</p>
        </div>
      </div>
      <p class="mt-2 text-xs text-(--ui-text-muted)">Gusts shown per day (dust signal). Source: Open-Meteo.</p>
    </section>

    <!-- radio -->
    <section class="mt-10">
      <h2 class="mb-3 font-display text-xl font-semibold text-primary">Playa radio</h2>
      <div class="grid gap-4 sm:grid-cols-2">
        <UCard>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-radio" class="size-5 text-primary" />
            <h3 class="font-semibold">BMIR 94.5 FM</h3>
          </div>
          <p class="mt-1 text-sm text-(--ui-text-muted)">Burning Man Information Radio — the city's voice.</p>
          <audio controls preload="none" :src="BMIR_STREAM" class="mt-3 w-full">
            Your browser can’t play this stream.
          </audio>
          <p class="mt-2 text-xs text-(--ui-text-muted)">
            Live during the event (Aug 30 – Sep 7, 2026). Off-air the rest of the year — the player
            will be silent until BMIR is broadcasting.
          </p>
        </UCard>
        <UCard>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-traffic-cone" class="size-5 text-primary" />
            <h3 class="font-semibold">GARS 95.1 FM</h3>
          </div>
          <p class="mt-1 text-sm text-(--ui-text-muted)">Gate Advisory Radio Station — Gate Road & SR-447 traffic, wait times, and Exodus advisories.</p>
          <div class="mt-3 rounded-lg bg-(--ui-bg-muted) px-3 py-2.5 text-sm">
            <p class="font-semibold">On-playa only · tune to 95.1 FM</p>
            <p class="mt-0.5 text-xs text-(--ui-text-muted)">No online stream. For live gate status from here, see the <NuxtLink to="/gate" class="text-primary underline">Gate page</NuxtLink>.</p>
          </div>
        </UCard>
      </div>
    </section>
  </UContainer>
</template>
