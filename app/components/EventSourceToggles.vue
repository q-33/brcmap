<script setup lang="ts">
import { DEFAULT_ON, EVENT_SOURCES } from '~~/lib/eventSources'

// The guide switches, sitting between Major Burns and the first day.
//
// Each published guide is hundreds of events, so they are off unless asked for —
// otherwise a camp's own listing drowns. The choice is remembered per browser,
// because nobody wants to re-tick "Queer Events" every time they check tomorrow.
//
// New guides appear here on their own: add an entry to lib/eventSources.ts.
const props = defineProps<{ counts: Record<string, number> }>()
const model = defineModel<string[]>({ required: true })

const STORE = 'brcmap.eventSources.v1'

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORE)
    if (raw) {
      const saved = JSON.parse(raw)
      if (Array.isArray(saved))
        // Ignore keys from a guide we have since removed.
        model.value = saved.filter((k: string) => EVENT_SOURCES.some(s => s.key === k))
    }
  }
  catch { /* private mode / disabled storage — defaults are fine */ }
})

watch(model, (v) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(v))
  }
  catch { /* not worth telling anyone about */ }
}, { deep: true })

function toggle(key: string) {
  const src = EVENT_SOURCES.find(s => s.key === key)
  if (src?.comingSoon)
    return
  model.value = model.value.includes(key)
    ? model.value.filter(k => k !== key)
    : [...model.value, key]
}

const isOn = (k: string) => model.value.includes(k)
const total = computed(() => EVENT_SOURCES.filter(s => isOn(s.key)).reduce((n, s) => n + (props.counts[s.key] ?? 0), 0))
const anyOff = computed(() => EVENT_SOURCES.some(s => !s.comingSoon && !isOn(s.key)))

function reset() {
  model.value = [...DEFAULT_ON]
}
</script>

<template>
  <section class="mb-8">
    <div class="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 class="font-display text-base font-semibold uppercase tracking-wide text-(--ui-text)">
        What are you looking for?
      </h2>
      <p class="text-sm text-(--ui-text-muted)">
        {{ total }} event{{ total === 1 ? '' : 's' }} showing
        <button v-if="!anyOff" type="button" class="ml-1 underline hover:text-primary" @click="model = []">hide all</button>
        <button v-else type="button" class="ml-1 underline hover:text-primary" @click="reset">reset</button>
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="s in EVENT_SOURCES"
        :key="s.key"
        type="button"
        :disabled="s.comingSoon"
        class="group relative flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-150"
        :class="[
          s.comingSoon
            ? 'cursor-not-allowed border-dashed border-(--ui-border) text-(--ui-text-muted) opacity-70'
            : isOn(s.key)
              ? 'border-transparent bg-primary text-inverted shadow-sm scale-[1.02]'
              : 'border-(--ui-border) text-(--ui-text-toned) hover:border-primary/50 hover:bg-primary/5',
        ]"
        :aria-pressed="s.comingSoon ? undefined : isOn(s.key)"
        @click="toggle(s.key)"
      >
        <span class="text-base leading-none transition-transform duration-150" :class="isOn(s.key) && 'scale-110'">{{ s.emoji }}</span>
        <span>{{ s.label }}</span>
        <UBadge
          v-if="s.nsfw"
          size="xs"
          :color="isOn(s.key) ? 'neutral' : 'error'"
          :variant="isOn(s.key) ? 'solid' : 'subtle'"
        >
          NSFW
        </UBadge>
        <span
          v-if="s.comingSoon"
          class="rounded-full bg-(--ui-bg-muted) px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
        >soon</span>
        <span
          v-else
          class="rounded-full px-1.5 py-0.5 text-[11px] tabular-nums"
          :class="isOn(s.key) ? 'bg-white/20' : 'bg-(--ui-bg-muted) text-(--ui-text-muted)'"
        >{{ counts[s.key] ?? 0 }}</span>
      </button>
    </div>

    <TransitionGroup
      tag="div"
      class="mt-2 space-y-0.5"
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      leave-active-class="transition duration-100 ease-in absolute"
      leave-to-class="opacity-0"
    >
      <p
        v-for="s in EVENT_SOURCES.filter(x => isOn(x.key))"
        :key="s.key"
        class="text-xs text-(--ui-text-muted)"
      >
        <span class="mr-1">{{ s.emoji }}</span>{{ s.blurb }}
      </p>
    </TransitionGroup>
  </section>
</template>
