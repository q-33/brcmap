<script setup lang="ts">
import { WAIT_CHOICES, fmtWait } from '~~/lib/exodus'
import { dustRisk } from '~~/lib/weather'

// The way out. Three layers of truth, each labelled with what it is:
//   1. the crowd meter — people in the line, through this site, one tap each
//   2. the org's @bmantraffic posts — mirrored when X permits, linked when not
//   3. the standing advice that never changes: fuller car, later hour, GARS 95.1
interface ExodusData {
  crowd: { median: number | null, count: number, newestAt: number | null, recent: { minutes: number, at: number }[] }
  official: { id: string, text: string, at: string }[] | null
  updatedAt: string
}
const { data, refresh } = await useFetch<ExodusData>('/api/exodus', { server: false, lazy: true })

let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => { poll = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 60_000) })
onBeforeUnmount(() => clearInterval(poll))

const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => { tick = setInterval(() => { now.value = Date.now() }, 30_000) })
onBeforeUnmount(() => clearInterval(tick))

const crowd = computed(() => data.value?.crowd ?? null)
const meterColor = computed(() => {
  const m = crowd.value?.median
  if (m == null)
    return '#9ca3af'
  // borrow the dust scale's colour grammar: green calm → red bad
  return m < 60 ? '#16a34a' : m < 150 ? '#65a30d' : m < 300 ? '#d97706' : '#dc2626'
})
const newestAge = computed(() => {
  const at = crowd.value?.newestAt
  if (!at)
    return null
  const mins = Math.round((now.value - at) / 60_000)
  return mins < 1 ? 'just now' : `${mins} min ago`
})

// report flow
const reported = ref(false)
const reportErr = ref('')
const busy = ref<number | null>(null)
async function report(minutes: number) {
  busy.value = minutes
  reportErr.value = ''
  try {
    await $fetch('/api/exodus/report', { method: 'POST', body: { minutes } })
    reported.value = true
    await refresh()
  }
  catch (e: any) {
    reportErr.value = e?.data?.statusMessage ?? 'Could not send that — try again in a minute.'
  }
  finally {
    busy.value = null
  }
}

function rel(iso: string): string {
  const mins = Math.round((now.value - Date.parse(iso)) / 60_000)
  if (mins < 1)
    return 'just now'
  if (mins < 60)
    return `${mins} min ago`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h} h ago` : new Date(iso).toLocaleDateString()
}

useHead({ title: 'Exodus — BRC Map' })
</script>

<template>
  <UContainer class="max-w-3xl py-10 sm:py-14">
    <div class="mb-2 flex items-end justify-between gap-3">
      <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Exodus</h1>
      <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton>
    </div>
    <p class="mb-8 text-(--ui-text-muted)">
      The way out. Gate Road times here come from burners actually in the line —
      when the official channels say something different, believe the official channels.
    </p>

    <!-- the crowd meter -->
    <UCard class="mb-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">Gate Road, per the crowd</p>
          <p class="mt-1 font-display text-4xl font-bold" :style="{ color: meterColor }">
            {{ crowd?.median != null ? fmtWait(crowd.median) : '—' }}
          </p>
          <p class="mt-1 text-xs text-(--ui-text-muted)">
            <template v-if="crowd?.median != null">
              median of {{ crowd!.count }} report{{ crowd!.count === 1 ? '' : 's' }} in the last 2 h · newest {{ newestAge }}
            </template>
            <template v-else>
              no reports in the last two hours — the meter starts when someone in the line taps below
            </template>
          </p>
        </div>
        <UIcon name="i-lucide-car-front" class="size-10 shrink-0 text-(--ui-text-muted)/40" />
      </div>

      <div class="mt-4 border-t border-(--ui-border) pt-3">
        <p class="mb-2 text-sm font-medium">In the line? How long is Gate Road taking?</p>
        <div v-if="!reported" class="flex flex-wrap gap-1.5">
          <UButton
            v-for="c in WAIT_CHOICES" :key="c.minutes"
            size="xs" color="neutral" variant="soft"
            :loading="busy === c.minutes"
            @click="report(c.minutes)"
          >{{ c.label }}</UButton>
        </div>
        <p v-else class="text-sm text-(--ui-text-toned)">
          Thanks — safe travels. You can report again in half an hour if the line changes.
        </p>
        <p v-if="reportErr" class="mt-2 text-xs text-amber-600 dark:text-amber-500">{{ reportErr }}</p>
        <p class="mt-2 text-xs text-(--ui-text-muted)">
          Anonymous — one tap, no account, no location read. One report per person per half hour.
        </p>
      </div>
    </UCard>

    <!-- the org -->
    <section class="mb-6">
      <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">Official channels</h2>
      <UCard v-if="data?.official?.length">
        <p class="mb-2 text-xs text-(--ui-text-muted)">
          Latest from <a href="https://x.com/bmantraffic" target="_blank" rel="noopener" class="text-primary underline">@bmantraffic</a>, the org's traffic desk:
        </p>
        <ul class="space-y-2.5">
          <li v-for="t in data!.official!.slice(0, 5)" :key="t.id" class="text-sm">
            <p class="whitespace-pre-line">{{ t.text }}</p>
            <p class="mt-0.5 text-xs text-(--ui-text-muted)">{{ rel(t.at) }}</p>
          </li>
        </ul>
      </UCard>
      <UCard v-else>
        <p class="text-sm text-(--ui-text-toned)">
          The org posts live Gate Road times on
          <a href="https://x.com/bmantraffic" target="_blank" rel="noopener" class="text-primary underline">@bmantraffic</a>
          and reads them out on <b>GARS 95.1 FM</b> from the moment you're in the car.
          We mirror the posts here when X lets us; right now it isn't, so tap through.
        </p>
      </UCard>
    </section>

    <!-- the advice that doesn't change -->
    <section class="mb-6">
      <h2 class="mb-3 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">Beating the line</h2>
      <UCard>
        <ul class="space-y-2 text-sm text-(--ui-text-toned)">
          <li class="flex gap-2"><UIcon name="i-lucide-clock" class="mt-0.5 size-4 shrink-0 text-primary" />When the reported time is LOW, everyone leaves at once and it stops being low. Leaving at a weird hour beats leaving at a good number.</li>
          <li class="flex gap-2"><UIcon name="i-lucide-users" class="mt-0.5 size-4 shrink-0 text-primary" />Fuller cars, fewer cars. The <NuxtLink to="/rides" class="text-primary underline">rideshare board</NuxtLink> has people who need exactly the seat you're leaving empty.</li>
          <li class="flex gap-2"><UIcon name="i-lucide-radio" class="mt-0.5 size-4 shrink-0 text-primary" />Tune <b>95.1 FM</b> the moment you join the line — pulse instructions come over GARS, not over the internet.</li>
          <li class="flex gap-2"><UIcon name="i-lucide-battery-charging" class="mt-0.5 size-4 shrink-0 text-primary" />Water, shade, snacks, a charged phone, and a full tank before you get in line. The line is part of the event; pack for it.</li>
          <li class="flex gap-2"><UIcon name="i-lucide-book-open" class="mt-0.5 size-4 shrink-0 text-primary" />The <a href="https://survival.burningman.org/transportation-traffic/exodus/" target="_blank" rel="noopener" class="text-primary underline">official Exodus guide</a> has the full picture, including Pulse and holiday-traffic timing.</li>
        </ul>
      </UCard>
    </section>
  </UContainer>
</template>
