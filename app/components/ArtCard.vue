<script setup lang="ts">
import { audioForArt } from '~~/lib/art/audioTour'
import { formatAddressNamed, parseAddress } from '~~/lib/brc/geocode'

interface Loc { addressString: string | null, gpsLatitude: number | null, gpsLongitude: number | null, createdAt: string }
interface Art {
  id: string
  name: string
  artist: string | null
  year: number
  description: string | null
  hometown: string | null
  call: string | null
  locations: Loc[]
}

const props = defineProps<{ art: Art }>()

// "7:30 & E" -> "7:30 & Eternal" (2026 themed names); falls back to the raw string
function namedAddress(s: string | null | undefined): string | null {
  if (!s)
    return null
  const a = parseAddress(s)
  return a ? formatAddressNamed(a) : s
}

const location = computed(() =>
  [...props.art.locations].sort((x, y) => +new Date(y.createdAt) - +new Date(x.createdAt))[0])
const track = computed(() => audioForArt(props.art.name))
</script>

<template>
  <UCard :to="`/art/${art.id}`" class="transition hover:ring-2 hover:ring-primary/30">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <h2 class="font-semibold">{{ art.name }}</h2>
        <p v-if="art.artist" class="text-sm text-(--ui-text-toned)">by {{ art.artist }}</p>
        <p v-if="location?.addressString" class="text-sm text-primary">
          📍 {{ namedAddress(location?.addressString) }}
        </p>
        <p v-else class="text-sm text-(--ui-text-muted)">location not set</p>
      </div>
      <div class="flex shrink-0 flex-col items-end gap-1">
        <UBadge variant="subtle" color="neutral">{{ art.year }}</UBadge>
        <UBadge v-if="track" variant="subtle" color="primary" size="xs">Track {{ track.n }}</UBadge>
      </div>
    </div>
    <p v-if="art.description" class="mt-2 line-clamp-3 text-sm text-(--ui-text-muted)">{{ art.description }}</p>
    <p v-if="art.hometown" class="mt-1 text-xs text-(--ui-text-muted)">🏠 {{ art.hometown }}</p>
    <UBadge v-if="art.call" color="primary" variant="subtle" size="xs" class="mt-2" icon="i-lucide-megaphone">Open call</UBadge>
    <div v-if="track" class="mt-3 border-t border-(--ui-border) pt-2">
      <AudioTourPlayer :track="track" />
    </div>
  </UCard>
</template>
