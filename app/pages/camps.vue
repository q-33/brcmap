<script setup lang="ts">
import { refDebounced } from '@vueuse/core'
import { formatAddressNamed, parseAddress } from '~~/lib/brc/geocode'

// "7:30 & E" -> "7:30 & Eternal" (2026 themed names); falls back to raw string
function namedAddress(s: string | null | undefined): string | null {
  if (!s)
    return null
  const a = parseAddress(s)
  return a ? formatAddressNamed(a) : s
}

interface Loc { addressString: string | null, gpsLatitude: number | null, gpsLongitude: number | null, createdAt: string }
interface Camp { id: string, name: string, year: number, description: string | null, hometown: string | null, website: string | null, frontageFt: number | null, depthFt: number | null, owner: { id: string, displayName: string | null } | null, locations: Loc[] }

const { canManageCamps, isAdmin } = useMe()
const toast = useToast()

const q = ref('')
const debounced = refDebounced(q, 250)

const { data: camps, status, refresh } = await useFetch<Camp[]>('/api/camps', {
  query: { q: debounced },
})

// --- manager/admin moderation: edit details or delete a camp made in error ---
const editOpen = ref(false)
const editId = ref('')
const editBusy = ref(false)
const editError = ref('')
const form = reactive({ name: '', description: '', website: '', hometown: '', contactEmail: '', frontageFt: null as number | null, depthFt: null as number | null })
function openEdit(c: Camp & { frontageFt?: number | null, depthFt?: number | null }) {
  editId.value = c.id
  editError.value = ''
  form.name = c.name
  form.description = c.description ?? ''
  form.website = c.website ?? ''
  form.hometown = c.hometown ?? ''
  form.contactEmail = ''
  form.frontageFt = (c as any).frontageFt ?? null
  form.depthFt = (c as any).depthFt ?? null
  editOpen.value = true
}
async function saveEdit() {
  if (!form.name.trim())
    return
  editBusy.value = true
  editError.value = ''
  try {
    await $fetch(`/api/camps/${editId.value}`, { method: 'PATCH', body: { ...form } })
    await refresh()
    editOpen.value = false
    toast.add({ title: 'Camp updated', color: 'success', icon: 'i-lucide-check' })
  }
  catch (e: any) {
    editError.value = e?.data?.statusMessage ?? 'Could not save'
  }
  finally {
    editBusy.value = false
  }
}
const deletingId = ref('')
async function removeCamp(c: Camp) {
  if (!confirm(`Delete camp “${c.name}”? This also removes its pin and events. This cannot be undone.`))
    return
  deletingId.value = c.id
  try {
    await $fetch(`/api/admin/camps/${c.id}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Camp deleted', description: c.name, color: 'success', icon: 'i-lucide-trash-2' })
  }
  catch (e: any) {
    toast.add({ title: 'Could not delete', description: e?.data?.statusMessage ?? 'Try again', color: 'error' })
  }
  finally {
    deletingId.value = ''
  }
}

function currentLocation(c: Camp): Loc | undefined {
  return [...c.locations].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
}
function mapped(c: Camp) {
  const l = currentLocation(c)
  return l && l.gpsLatitude != null && l.gpsLongitude != null ? l : undefined
}

useHead({ title: 'Camps — BurnerMap' })
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div class="mb-6">
      <div class="flex items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">Camps</h1>
          <p class="mt-1 text-(--ui-text-muted)">Browse and search theme camps placed on the map.</p>
        </div>
        <UBadge color="neutral" variant="subtle" class="shrink-0">{{ camps?.length ?? 0 }} shown</UBadge>
      </div>
    </div>

    <UInput
      v-model="q"
      icon="i-lucide-search"
      placeholder="Search camps by name, description, or hometown…"
      size="xl"
      class="mb-8 w-full"
      :loading="status === 'pending'"
    />

    <div v-if="camps && camps.length" class="grid gap-3 sm:grid-cols-2">
      <UCard v-for="c in camps" :key="c.id">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold">{{ c.name }}</h2>
            <p v-if="currentLocation(c)?.addressString" class="text-sm text-primary">
              📍 {{ namedAddress(currentLocation(c)?.addressString) }}
            </p>
            <p v-else class="text-sm text-(--ui-text-muted)">location not set</p>
          </div>
          <UBadge variant="subtle" color="neutral">{{ c.year }}</UBadge>
        </div>
        <p v-if="c.description" class="mt-2 line-clamp-3 text-sm text-(--ui-text-muted)">{{ c.description }}</p>
        <p v-if="c.hometown" class="mt-1 text-xs text-(--ui-text-muted)">🏠 {{ c.hometown }}</p>
        <a v-if="c.website" :href="c.website" target="_blank" rel="noopener" class="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <UIcon name="i-lucide-link" class="size-3" />{{ c.website.replace(/^https?:\/\/(www\.)?/, '') }}
        </a>
        <template v-if="mapped(c) || canManageCamps" #footer>
          <div class="flex items-center gap-3">
            <UButton
              v-if="mapped(c)"
              :to="`/?lat=${mapped(c)!.gpsLatitude}&lng=${mapped(c)!.gpsLongitude}`"
              size="xs"
              variant="link"
              class="px-0"
            >
              View on map →
            </UButton>
            <!-- BM Org / Admin: place or move this camp on the map -->
            <UButton
              v-if="canManageCamps"
              :to="`/?adminCamp=${c.id}`"
              size="xs"
              variant="link"
              class="px-0"
              icon="i-lucide-map-pin"
            >
              {{ mapped(c) ? 'Move on map' : 'Place on map' }}
            </UButton>
            <UButton
              v-if="canManageCamps && mapped(c)"
              :to="`/?editCamp=${c.id}`"
              size="xs"
              variant="link"
              class="px-0"
              icon="i-lucide-frame"
            >
              Boundary
            </UButton>
            <UButton v-if="canManageCamps" size="xs" variant="link" class="px-0" icon="i-lucide-pencil" @click="openEdit(c)">Edit</UButton>
            <UButton v-if="isAdmin" size="xs" variant="link" color="error" class="px-0" icon="i-lucide-trash-2" :loading="deletingId === c.id" @click="removeCamp(c)">Delete</UButton>
          </div>
        </template>
      </UCard>
    </div>

    <div v-else-if="status !== 'pending'" class="py-16 text-center text-(--ui-text-muted)">
      <UIcon name="i-lucide-tent" class="mx-auto mb-3 size-10 opacity-40" />
      <p v-if="q">No camps match “{{ q }}”.</p>
      <p v-else>No camps yet. Be the first to drop a pin on the map!</p>
    </div>

    <!-- manager/admin: edit a camp's details in place -->
    <UModal v-model:open="editOpen" title="Edit camp">
      <template #body>
        <form class="space-y-3" @submit.prevent="saveEdit">
          <UInput v-model="form.name" placeholder="Camp name" class="w-full" />
          <UTextarea v-model="form.description" :rows="3" autoresize placeholder="Description" class="w-full" />
          <UInput v-model="form.website" type="url" placeholder="Website — https://…" icon="i-lucide-link" class="w-full" />
          <div class="grid grid-cols-2 gap-2">
            <UInput v-model="form.hometown" placeholder="Hometown" class="w-full" />
            <UInput v-model="form.contactEmail" type="email" placeholder="Contact email" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <UInput v-model.number="form.frontageFt" type="number" min="0" placeholder="Frontage (ft)" class="w-full" />
            <UInput v-model.number="form.depthFt" type="number" min="0" placeholder="Depth (ft)" class="w-full" />
          </div>
          <p class="text-xs text-(--ui-text-muted)">Tip: use “Boundary” to drag the pin &amp; resize the plot live on the map.</p>
          <p v-if="editError" class="text-sm text-red-600">{{ editError }}</p>
          <UButton type="submit" block :loading="editBusy" :disabled="!form.name.trim()">Save details</UButton>
        </form>
      </template>
    </UModal>
  </UContainer>
</template>
