<script setup lang="ts">
import type { AirNow, FireAlert, FireIncident } from '~~/lib/fires'
import { aqiBand, describeIncident } from '~~/lib/fires'
import { dustRisk, tempBoth, toCelsius, toKmh, windBoth, windDir, wmo } from '~~/lib/weather'

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
interface StationReading {
  key: string, label: string, owner: string, observedAt: string, fresh: boolean
  tempF: number | null, feelsLikeF: number | null, humidity: number | null
  windMph: number | null, gustMph: number | null, lullMph: number | null, windDirDeg: number | null
  pressureInHg: number | null, pressureTrend: string | null, dewPointF: number | null
  wbgtF: number | null, uv: number | null, precipTodayIn: number | null
  lightningLast1hr: number | null, lightningLastDistanceMi: number | null
}
interface ExtendedDay { date: string, max: number, min: number, windMax: number, precip: number }
interface Weather {
  current: Current | null
  days: Day[]
  stations: StationReading[]
  primary: 'station' | 'model'
  extended: { model: string, days: ExtendedDay[] } | null
  updatedAt: string
}

const { data, refresh, status } = await useFetch<Weather>('/api/weather')

const cur = computed(() => data.value?.current ?? null)

// The station we lead with: the freshest one still reporting. A station that has
// gone quiet is kept out of the headline entirely — showing an hour-old gust as
// "current" during a dust event is worse than showing the model.
const station = computed(() => (data.value?.stations ?? []).find(s => s.fresh) ?? null)
const staleStations = computed(() => (data.value?.stations ?? []).filter(s => !s.fresh))

function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (mins < 1) return 'just now'
  if (mins === 1) return '1 min ago'
  if (mins < 60) return `${mins} min ago`
  const h = Math.round(mins / 60)
  return h === 1 ? '1 hour ago' : `${h} hours ago`
}

// Worth saying out loud when the station and the model disagree markedly — it is
// usually the station that is right, and it is always worth knowing.
const windGap = computed(() => {
  const s = station.value?.windMph
  const m = cur.value?.wind_speed_10m
  if (s == null || m == null) return null
  const diff = Math.round(s - m)
  return Math.abs(diff) >= 8 ? diff : null
})
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

// Fire, smoke and official alerts around the city. Lazy + client-side so a slow
// federal feed never holds up the weather above it.
interface Fires { alerts: FireAlert[], incidents: FireIncident[], air: AirNow, updatedAt: string }
const { data: fires } = await useFetch<Fires>('/api/fires', { server: false, lazy: true })
const air = computed(() => aqiBand(fires.value?.air?.usAqi ?? null))
// Only shout about a worse-later forecast when it crosses into a new band.
const airLater = computed(() => {
  const now = fires.value?.air?.usAqi ?? null
  const peak = fires.value?.air?.aqiNext24 ?? null
  if (now == null || peak == null || peak <= now)
    return null
  const band = aqiBand(peak)
  return band.label === air.value.label ? null : { peak, ...band }
})
function alertTone(sev: string | null) {
  const s = (sev ?? '').toLowerCase()
  if (s === 'extreme' || s === 'severe')
    return { bg: '#7f1d1d', fg: '#ffffff' }
  return { bg: '#d97706', fg: '#ffffff' }
}
function alertWindow(iso: string | null) {
  if (!iso)
    return ''
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

// BMIR streams only during the event window (Aug 30 – Sep 7, 2026).
const BMIR_STREAM = 'https://stream.revma.ihrhls.com/zc8378'
// Shouting Fire runs year round. Their own player still points at a bmir-ice
// host (Bobzilla ran BMIR before starting this), which is confusing and
// http-only; this is the same Icecast mount on their TLS host, so the player
// is not blocked as mixed content.
const SHOUTING_FIRE_STREAM = 'https://shoutingfire-ice.streamguys1.com/live'

useHead({ title: 'Live — BRC Map' })
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-14">
    <div class="mb-2 flex items-end justify-between gap-3">
      <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Live on Playa</h1>
      <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" :loading="status === 'pending'" @click="refresh()">Refresh</UButton>
    </div>
    <p class="mb-8 text-(--ui-text-muted)">Weather, dust outlook, and radio for Black Rock City.</p>

    <!-- On-playa station: leads whenever one is reporting, because a sensor in
         the dust beats a model reading a 9 km grid square. -->
    <UCard v-if="station" class="mb-4 ring-1 ring-primary/30">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <UIcon name="i-lucide-radio-tower" class="size-5 shrink-0 text-primary" />
        <h2 class="font-display text-sm font-bold uppercase tracking-wide text-primary">On the playa now</h2>
        <UBadge size="xs" color="primary" variant="subtle">{{ station.label }}</UBadge>
        <span class="text-xs text-(--ui-text-muted)">measured here · {{ agoLabel(station.observedAt) }}</span>
      </div>

      <div class="mt-4 flex items-center gap-5">
        <div class="flex-1">
          <p v-if="station.tempF != null" class="font-display text-5xl font-bold leading-none">{{ Math.round(station.tempF) }}°F</p>
          <p class="mt-1 text-(--ui-text-muted)">
            <template v-if="station.tempF != null">{{ Math.round(toCelsius(station.tempF)) }}°C</template>
            <template v-if="station.feelsLikeF != null"> · feels {{ tempBoth(station.feelsLikeF) }}</template>
          </p>
        </div>
        <div v-if="station.windMph != null" class="text-right">
          <p class="font-display text-3xl font-bold leading-none">{{ Math.round(station.windMph) }}<span class="text-lg"> mph</span></p>
          <p class="text-xs text-(--ui-text-muted)">
            {{ station.windDirDeg != null ? windDir(station.windDirDeg) : '' }}
            <template v-if="station.gustMph != null"> · gusting {{ Math.round(station.gustMph) }}</template>
          </p>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div v-if="station.gustMph != null" class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Wind lull / gust</p>
          <p class="font-semibold">{{ Math.round(station.lullMph ?? 0) }} – {{ Math.round(station.gustMph) }} mph</p>
        </div>
        <div v-if="station.humidity != null" class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Humidity</p>
          <p class="font-semibold">{{ Math.round(station.humidity) }}%</p>
          <p v-if="station.dewPointF != null" class="text-xs text-(--ui-text-muted)">dew pt {{ Math.round(station.dewPointF) }}°F</p>
        </div>
        <!-- the number heat-safety guidance is actually written against -->
        <div v-if="station.wbgtF != null" class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Heat stress (WBGT)</p>
          <p class="font-semibold">{{ Math.round(station.wbgtF) }}°F</p>
        </div>
        <div v-if="station.uv != null" class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">UV index</p>
          <p class="font-semibold">{{ Math.round(station.uv) }}</p>
        </div>
        <div v-if="station.pressureInHg != null" class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Pressure</p>
          <p class="font-semibold">{{ station.pressureInHg.toFixed(2) }} inHg</p>
          <p v-if="station.pressureTrend" class="text-xs text-(--ui-text-muted)">{{ station.pressureTrend }}</p>
        </div>
        <div v-if="station.precipTodayIn" class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Rain today</p>
          <p class="font-semibold">{{ station.precipTodayIn.toFixed(2) }}"</p>
        </div>
      </div>

      <!-- lightning is the one reading worth interrupting someone for -->
      <div v-if="station.lightningLast1hr" class="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/10 p-2.5 text-sm">
        <UIcon name="i-lucide-zap" class="mt-0.5 size-4 shrink-0 text-amber-500" />
        <p class="text-(--ui-text-toned)">
          <b>{{ station.lightningLast1hr }} lightning strike{{ station.lightningLast1hr === 1 ? '' : 's' }}</b> detected in the last hour<span v-if="station.lightningLastDistanceMi != null">, nearest about {{ Math.round(station.lightningLastDistanceMi) }} mi away</span>.
        </p>
      </div>

      <p class="mt-3 text-xs text-(--ui-text-muted)">
        Station brought to the playa by <b class="text-(--ui-text)">{{ station.owner }}</b>.
        <template v-if="windGap">
          Reading {{ Math.abs(windGap) }} mph {{ windGap > 0 ? 'windier' : 'calmer' }} than the forecast model right now — trust the station.
        </template>
      </p>
    </UCard>

    <p v-if="!station && staleStations.length" class="mb-4 rounded-lg border border-(--ui-border) p-3 text-sm text-(--ui-text-muted)">
      <UIcon name="i-lucide-radio-tower" class="mr-1 inline size-4" />
      {{ staleStations[0]!.label }} last reported {{ agoLabel(staleStations[0]!.observedAt) }} — showing the forecast model until it checks in again.
    </p>

    <!-- current weather -->
    <UCard v-if="cur">
      <div class="flex items-center gap-5">
        <UIcon :name="curWmo?.icon ?? 'i-lucide-cloud'" class="size-14 shrink-0 text-primary" />
        <div class="flex-1">
          <p class="font-display text-5xl font-bold leading-none">{{ Math.round(cur.temperature_2m) }}°F</p>
          <p class="mt-1 text-(--ui-text-muted)">{{ Math.round(toCelsius(cur.temperature_2m)) }}°C · {{ curWmo?.label }} · feels {{ tempBoth(cur.apparent_temperature) }}</p>
          <p v-if="station" class="mt-1 text-xs text-(--ui-text-muted)">Forecast model — the station above is measuring the real thing.</p>
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
          <p class="text-xs text-(--ui-text-muted)">{{ Math.round(toKmh(cur.wind_speed_10m)) }} km/h</p>
        </div>
        <div class="rounded-lg border border-(--ui-border) p-2.5">
          <p class="text-xs text-(--ui-text-muted)">Gusts</p>
          <p class="font-semibold">{{ Math.round(cur.wind_gusts_10m) }} mph</p>
          <p class="text-xs text-(--ui-text-muted)">{{ Math.round(toKmh(cur.wind_gusts_10m)) }} km/h</p>
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
          <p class="text-sm"><b>{{ Math.round(d.max) }}°F</b> <span class="text-(--ui-text-muted)">{{ Math.round(d.min) }}°F</span></p>
          <p class="text-xs text-(--ui-text-muted)"><b>{{ Math.round(toCelsius(d.max)) }}°C</b> {{ Math.round(toCelsius(d.min)) }}°C</p>
          <p class="mt-1 text-xs" :style="{ color: dustRisk(d.gustMax).color }">{{ windBoth(d.gustMax) }}</p>
          <p v-if="d.precip > 5" class="text-xs text-(--ui-text-muted)">{{ d.precip }}% 🌧</p>
        </div>
      </div>
      <p class="mt-2 text-xs text-(--ui-text-muted)">Gusts shown per day (dust signal). Source: Open-Meteo.</p>
    </section>

    <!-- The European model, out past the week. Deliberately quieter than the
         7-day above: at ten days out this is for deciding what to pack, not
         what to wear. Days already covered above are skipped. -->
    <section v-if="data?.extended?.days?.length" class="mt-8">
      <div class="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 class="font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">Extended outlook</h2>
        <span class="text-xs text-(--ui-text-muted)">{{ data.extended.model }}</span>
      </div>
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
        <div
          v-for="(d, i) in data.extended.days.filter(x => !data!.days.some(y => y.date === x.date))"
          :key="d.date"
          class="rounded-xl border border-dashed border-(--ui-border) p-2.5 text-center"
        >
          <p class="text-xs font-semibold">{{ dayName(d.date, i + 99) }}</p>
          <p class="mt-1 text-sm"><b>{{ Math.round(d.max) }}°F</b> <span class="text-(--ui-text-muted)">{{ Math.round(d.min) }}°F</span></p>
          <p class="text-xs text-(--ui-text-muted)">{{ Math.round(toCelsius(d.max)) }}° / {{ Math.round(toCelsius(d.min)) }}°C</p>
          <p class="mt-1 text-xs" :style="{ color: dustRisk(d.windMax).color }">{{ Math.round(d.windMax) }} mph</p>
        </div>
      </div>
      <p class="mt-2 text-xs text-(--ui-text-muted)">
        The European Centre's model, run out to fifteen days. Useful for packing; the week above is the one to plan around.
      </p>
    </section>

    <!-- fire & smoke -->
    <section v-if="fires" class="mt-10">
      <div class="mb-3 flex items-baseline justify-between gap-3">
        <h2 class="font-display text-xl font-semibold text-primary">Fire &amp; smoke</h2>
        <span class="text-xs text-(--ui-text-muted)">updated {{ clockTime(fires.updatedAt) }}</span>
      </div>

      <!-- official watches and warnings, verbatim from the National Weather Service -->
      <div
        v-for="a in fires.alerts"
        :key="a.url ?? a.event"
        class="mb-3 rounded-xl px-4 py-3"
        :style="{ background: alertTone(a.severity).bg, color: alertTone(a.severity).fg }"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-triangle-alert" class="size-5 shrink-0" />
          <p class="font-semibold">{{ a.event }}</p>
          <span v-if="a.ends" class="ml-auto text-xs opacity-80">until {{ alertWindow(a.ends) }}</span>
        </div>
        <p v-if="a.headline" class="mt-1 text-sm opacity-95">{{ a.headline }}</p>
        <p v-if="a.area" class="mt-1 text-xs opacity-80">{{ a.area }}</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <!-- air quality -->
        <UCard>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-wind" class="size-5 text-primary" />
            <h3 class="font-semibold">Air quality</h3>
          </div>
          <div class="mt-2 flex items-baseline gap-2">
            <p class="font-display text-4xl font-bold leading-none">{{ fires.air.usAqi ?? '—' }}</p>
            <span class="rounded-full px-2 py-0.5 text-xs font-semibold text-white" :style="{ background: air.color }">{{ air.label }}</span>
          </div>
          <p class="mt-1 text-sm text-(--ui-text-muted)">
            US AQI<span v-if="fires.air.pm25 != null"> · PM2.5 {{ fires.air.pm25 }} µg/m³</span>
          </p>
          <p class="mt-2 text-sm">{{ air.advice }}</p>
          <p v-if="airLater" class="mt-2 rounded-lg bg-(--ui-bg-muted) px-3 py-2 text-xs">
            Forecast to reach <b>{{ airLater.peak }}</b> ({{ airLater.label }}) within 24 hours.
          </p>
        </UCard>

        <!-- nearest active fires -->
        <UCard>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-flame" class="size-5 text-primary" />
            <h3 class="font-semibold">Active fires nearby</h3>
          </div>
          <p v-if="!fires.incidents.length" class="mt-2 text-sm text-(--ui-text-muted)">
            No active incidents reported within 300 km.
          </p>
          <ul v-else class="mt-2 space-y-2">
            <li v-for="f in fires.incidents" :key="f.name + f.km" class="text-sm">
              <div class="flex items-baseline justify-between gap-2">
                <span class="font-semibold">{{ f.name }}</span>
                <span class="shrink-0 text-xs text-(--ui-text-muted)">{{ Math.round(f.km) }} km {{ f.bearing }}</span>
              </div>
              <p class="text-xs text-(--ui-text-muted)">
                {{ describeIncident(f) }}<span v-if="f.county"> · {{ f.county }}, {{ f.state }}</span>
              </p>
            </li>
          </ul>
          <p class="mt-3 text-xs text-(--ui-text-muted)">Distance and bearing are from the Man. Source: NIFC.</p>
        </UCard>
      </div>

      <div class="mt-4 rounded-xl border border-(--ui-border) bg-(--ui-bg-muted) px-4 py-3 text-sm">
        <p class="font-semibold">BRC Map is not an emergency service.</p>
        <p class="mt-1 text-(--ui-text-muted)">
          Evacuation orders come from county emergency managers and change by the hour. If you are
          travelling to or from the playa, check these before you go:
        </p>
        <ul class="mt-2 space-y-1 text-(--ui-text-muted)">
          <li><a href="https://www.oem.nv.gov/wildfire-info-2026/" target="_blank" rel="noopener" class="text-primary underline">Nevada Emergency Management — wildfire info</a></li>
          <li><a href="https://www.emergencywashoe.com/" target="_blank" rel="noopener" class="text-primary underline">Washoe County emergency (evacuations, shelters)</a></li>
          <li><a href="https://inciweb.wildfire.gov/" target="_blank" rel="noopener" class="text-primary underline">InciWeb — incident detail</a></li>
          <li><a href="https://www.weather.gov/rev/" target="_blank" rel="noopener" class="text-primary underline">NWS Reno — watches and warnings</a></li>
          <li><a href="https://fire.airnow.gov/" target="_blank" rel="noopener" class="text-primary underline">AirNow Fire &amp; Smoke Map</a></li>
        </ul>
        <p class="mt-2 text-xs text-(--ui-text-muted)">
          Alerts are shown verbatim from the National Weather Service. Nothing here decides whether an
          area is evacuated.
        </p>
      </div>
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
        <UCard>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-flame" class="size-5 text-primary" />
            <h3 class="font-semibold">Shouting Fire 99.5 FM</h3>
          </div>
          <p class="mt-1 text-sm text-(--ui-text-muted)">The global burner radio network, started by Bobzilla, formerly one of BMIR's managers. On air year round, not just event week.</p>
          <audio controls preload="none" :src="SHOUTING_FIRE_STREAM" class="mt-3 w-full">
            Your browser can’t play this stream.
          </audio>
          <p class="mt-2 text-xs text-(--ui-text-muted)">
            On playa · tune to 99.5 FM. Also on
            <a href="https://shoutingfire.com" target="_blank" rel="noopener" class="text-primary underline">shoutingfire.com</a>,
            iHeart, TuneIn and their own app.
          </p>
        </UCard>
        <UCard>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-music" class="size-5 text-primary" />
            <h3 class="font-semibold">The K-Hole 102.3 FM</h3>
          </div>
          <p class="mt-1 text-sm text-(--ui-text-muted)">Music for the staff and volunteers who build the city. 50 watts on playa from August, and an online stream the rest of the year.</p>
          <div class="mt-3 rounded-lg bg-(--ui-bg-muted) px-3 py-2.5 text-sm">
            <p class="font-semibold">On playa · tune to 102.3 FM</p>
            <p class="mt-0.5 text-xs text-(--ui-text-muted)">
              Listen online at <a href="https://thekhole.radio12345.com/" target="_blank" rel="noopener" class="text-primary underline">thekhole.radio12345.com</a>
              (or search “thekhole” in the Listen2MyRadio app), and see
              <a href="https://www.facebook.com/khole1023fmbrc" target="_blank" rel="noopener" class="text-primary underline">their Facebook page</a> for the schedule.
            </p>
          </div>
        </UCard>
      </div>
    </section>
  </UContainer>
</template>
