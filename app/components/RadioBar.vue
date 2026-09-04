<script setup lang="ts">
// The floating now-playing bar. Mounted once in app.vue, so it outlives every
// page change — which is the point: the music keeps going when you walk from the
// map to the camp list, and there is always somewhere to press stop.
//
// It renders nothing at all until a station is loaded, so it costs a silent
// visitor an empty <template> and no layout.
const { state, station, stop } = useRadio()
const show = computed(() => !!state.value.key || !!state.value.error)
</script>

<template>
  <Transition
    enter-active-class="transition duration-200" leave-active-class="transition duration-150"
    enter-from-class="translate-y-3 opacity-0" leave-to-class="translate-y-3 opacity-0"
  >
    <!-- Bottom centre: the map's own controls sit bottom-LEFT and bottom-RIGHT,
         so this threads between them instead of covering either. -->
    <div
      v-if="show"
      class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3"
    >
      <div class="pointer-events-auto flex max-w-[92vw] items-center gap-2.5 rounded-full border border-white/10 bg-[#26211a]/90 px-3.5 py-2 text-sm text-white shadow-xl backdrop-blur-xl">
        <UIcon
          :name="state.loading ? 'i-lucide-loader-circle' : state.error ? 'i-lucide-radio-tower' : 'i-lucide-radio'"
          :class="['size-4 shrink-0', state.error ? 'text-amber-400' : 'text-primary', state.loading && 'animate-spin']"
        />

        <template v-if="state.error">
          <span class="truncate text-white/80">{{ state.error }}</span>
        </template>
        <template v-else>
          <span class="truncate font-medium">{{ station?.name }}</span>
          <span class="hidden shrink-0 text-white/60 sm:inline">{{ station?.dial }}</span>
          <!-- the little level meter, only while actually playing -->
          <span v-if="state.playing" class="flex shrink-0 items-end gap-0.5" aria-hidden="true">
            <span
              v-for="(h, i) in [7, 11, 5]" :key="i"
              class="w-0.5 animate-pulse rounded-full bg-emerald-400"
              :style="{ height: `${h}px`, animationDelay: `${i * 140}ms` }"
            />
          </span>
          <span v-else-if="state.loading" class="shrink-0 text-xs text-white/60">tuning in…</span>
        </template>

        <button
          type="button"
          class="ml-1 shrink-0 rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
          :aria-label="state.error ? 'Dismiss' : `Stop ${station?.name}`"
          @click="stop"
        >
          <UIcon :name="state.error ? 'i-lucide-x' : 'i-lucide-square'" class="size-4" />
        </button>
      </div>
    </div>
  </Transition>
</template>
