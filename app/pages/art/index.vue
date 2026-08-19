<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { formatAddressNamed, parseAddress } from '~~/lib/brc/geocode'
import { TOUR_EXTRAS, audioForArt } from '~~/lib/art/audioTour'

// "7:30 & E" -> "7:30 & Eternal" (2026 themed names); falls back to raw string
function namedAddress(s: string | null | undefined): string | null {
  if (!s)
    return null
  const a = parseAddress(s)
  return a ? formatAddressNamed(a) : s
}

interface Loc { addressString: string | null, gpsLatitude: number | null, gpsLongitude: number | null, createdAt: string }
interface Art { id: string, name: string, artist: string | null, year: number, description: string | null, hometown: string | null, call: string | null, locations: Loc[] }

const q = ref('')
const debounced = refDebounced(q, 250)

const { data: artworks, status } = await useFetch<Art[]>('/api/art', {
  query: { q: debounced },
})

function currentLocation(a: Art): Loc | undefined {
  return [...a.locations].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt))[0]
}

// Burning Man's 2026 Art Audio Tour. Tracks are matched to artworks by name, so
// a piece we list under a different title simply has no player — never a wrong one.
const withAudio = computed(() => (artworks.value ?? []).filter(a => audioForArt(a.name)).length)

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

    <UCard variant="subtle" class="mb-6">
      <div class="flex items-start gap-3">
        <UIcon name="i-lucide-headphones" class="mt-0.5 size-5 shrink-0 text-primary" />
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-(--ui-text)">Art Audio Tour</p>
          <p class="mt-0.5 text-sm text-(--ui-text-muted)">
            Burning Man's official audio guide to the 2026 art, narrated piece by piece.
            {{ withAudio }} of the artworks below have a track — look for the play button.
          </p>
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
    </UCard>

    <UInput
      v-model="q"
      icon="i-lucide-search"
      placeholder="Search art by name, description, or hometown…"
      size="xl"
      class="mb-8 w-full"
      :loading="status === 'pending'"
    />

    <div v-if="artworks && artworks.length" class="grid gap-3 sm:grid-cols-2">
      <UCard v-for="a in artworks" :key="a.id" :to="`/art/${a.id}`" class="transition hover:ring-2 hover:ring-primary/30">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold">{{ a.name }}</h2>
            <p v-if="a.artist" class="text-sm text-(--ui-text-toned)">by {{ a.artist }}</p>
            <p v-if="currentLocation(a)?.addressString" class="text-sm text-primary">
              📍 {{ namedAddress(currentLocation(a)?.addressString) }}
            </p>
            <p v-else class="text-sm text-(--ui-text-muted)">location not set</p>
          </div>
          <UBadge variant="subtle" color="neutral">{{ a.year }}</UBadge>
        </div>
        <p v-if="a.description" class="mt-2 line-clamp-3 text-sm text-(--ui-text-muted)">{{ a.description }}</p>
        <p v-if="a.hometown" class="mt-1 text-xs text-(--ui-text-muted)">🏠 {{ a.hometown }}</p>
        <UBadge v-if="a.call" color="primary" variant="subtle" size="xs" class="mt-2" icon="i-lucide-megaphone">Open call</UBadge>
        <div v-if="audioForArt(a.name)" class="mt-3 border-t border-(--ui-border) pt-2">
          <AudioTourPlayer :track="audioForArt(a.name)!" />
        </div>
      </UCard>
    </div>

    <div v-else-if="status !== 'pending'" class="py-16 text-center text-(--ui-text-muted)">
      <UIcon name="i-lucide-palette" class="mx-auto mb-3 size-10 opacity-40" />
      <p v-if="q">No art matches “{{ q }}”.</p>
      <p v-else>No art yet. Be the first to drop a pin on the map!</p>
    </div>
  </UContainer>
</template>
