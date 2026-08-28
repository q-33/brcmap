<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { TOUR_EXTRAS, audioForArt } from '~~/lib/art/audioTour'

interface Loc { addressString: string | null, gpsLatitude: number | null, gpsLongitude: number | null, createdAt: string }
interface Art { id: string, name: string, artist: string | null, year: number, description: string | null, hometown: string | null, call: string | null, locations: Loc[] }

const q = ref('')
const debounced = refDebounced(q, 250)

const { data: artworks, status } = await useFetch<Art[]>('/api/art', {
  query: { q: debounced },
})

// Split the listing in two: the pieces Burning Man narrated, and everything else.
//
// Tracks are matched to artworks by name, so a piece we list under a different
// title simply falls into the second group — never gets someone else's narration.
//
// The tour half is ordered by TRACK NUMBER rather than by when the row was
// created: that is the order the guide walks you through the city in, and it is
// the only ordering that makes the section usable as a tour.
const tourArt = computed(() =>
  (artworks.value ?? [])
    .filter(a => audioForArt(a.name))
    .sort((a, b) => (audioForArt(a.name)!.n) - (audioForArt(b.name)!.n)))

const otherArt = computed(() => (artworks.value ?? []).filter(a => !audioForArt(a.name)))

useHead({ title: 'Art — BRC Map' })
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mb-6">
      <div class="flex items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Art</h1>
          <p class="mt-1 text-(--ui-text-muted)">Browse and search art installations placed on the playa.</p>
        </div>
        <UBadge color="neutral" variant="subtle" class="shrink-0">{{ artworks?.length ?? 0 }} shown</UBadge>
      </div>
    </div>

    <UInput
      v-model="q"
      icon="i-lucide-search"
      placeholder="Search art by name, description, or hometown…"
      size="xl"
      class="mb-8 w-full"
      :loading="status === 'pending'"
    />

    <!-- The tour: its own two tracks first, then every narrated artwork in tour order. -->
    <section v-if="tourArt.length || !q" class="mb-10">
      <div class="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-headphones" class="mt-0.5 size-5 shrink-0 text-primary" />
          <div class="min-w-0 flex-1">
            <h2 class="font-display text-xl font-semibold text-primary">Art Audio Tour</h2>
            <p class="mt-0.5 text-sm text-(--ui-text-muted)">
              Burning Man's official audio guide to the 2026 art, narrated piece by piece.
              Play it straight through, or pick out a single piece below.
            </p>
            <!-- the whole tour, hands-free, above the individual tracks -->
            <div class="mt-3">
              <AudioTourPlayAll />
            </div>

            <div class="mt-3 space-y-2">
              <div v-for="t in TOUR_EXTRAS" :key="t.n">
                <p class="text-sm font-medium text-(--ui-text)">
                  {{ t.n === 0 ? 'Introduction' : 'The Theme — Axis Mundi, by Stewart Mangrum' }}
                </p>
                <AudioTourPlayer :track="t" />
              </div>
            </div>
          </div>
        </div>

        <div v-if="tourArt.length" class="mt-5 border-t border-primary/20 pt-4">
          <div class="mb-3 flex items-end justify-between gap-3">
            <h3 class="font-semibold text-(--ui-text)">Narrated artworks</h3>
            <UBadge color="primary" variant="subtle" class="shrink-0">{{ tourArt.length }} with audio</UBadge>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <ArtCard v-for="a in tourArt" :key="a.id" :art="a" />
          </div>
        </div>
        <p v-else-if="q" class="mt-4 border-t border-primary/20 pt-4 text-sm text-(--ui-text-muted)">
          No narrated artwork matches “{{ q }}”.
        </p>
      </div>
    </section>

    <!-- Everything else. -->
    <section v-if="otherArt.length">
      <div class="mb-3 flex items-end justify-between gap-3">
        <h2 class="font-display text-xl font-semibold">More art</h2>
        <UBadge color="neutral" variant="subtle" class="shrink-0">{{ otherArt.length }} without audio</UBadge>
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <ArtCard v-for="a in otherArt" :key="a.id" :art="a" />
      </div>
    </section>

    <div v-if="!artworks?.length && status !== 'pending'" class="py-16 text-center text-(--ui-text-muted)">
      <UIcon name="i-lucide-palette" class="mx-auto mb-3 size-10 opacity-40" />
      <p v-if="q">No art matches “{{ q }}”.</p>
      <p v-else>No art yet. Be the first to drop a pin on the map!</p>
    </div>
  </UContainer>
</template>
