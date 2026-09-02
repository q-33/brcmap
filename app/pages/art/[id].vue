<script setup lang="ts">
import { formatAddressNamed, parseAddress } from '~~/lib/brc/geocode'
import { audioForArt } from '~~/lib/art/audioTour'

function namedAddress(s: string | null | undefined): string | null {
  if (!s)
    return null
  const a = parseAddress(s)
  return a ? formatAddressNamed(a) : s
}

interface Loc { addressString: string | null, gpsLatitude: number | null, gpsLongitude: number | null, createdAt: string }
interface Contribution {
  id: string
  body: string
  language: string | null
  mediaUrl: string | null
  authorName: string | null
  status: 'pending' | 'published' | 'hidden'
  createdAt: string
}
interface ArtDetail {
  id: string
  name: string
  artist: string | null
  year: number
  description: string | null
  hometown: string | null
  website: string | null
  contactEmail: string | null
  call: string | null
  isOwner: boolean
  canManage: boolean
  owner: { id: string, displayName: string | null, playaName: string | null } | null
  locations: Loc[]
  contributions: Contribution[]
}

const route = useRoute()
const id = computed(() => String(route.params.id))
const { loggedIn } = useUserSession()

const { data: art, refresh, error } = await useFetch<ArtDetail>(() => `/api/art/${id.value}`)

const currentLoc = computed<Loc | undefined>(() =>
  art.value?.locations?.length
    ? [...art.value.locations].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
    : undefined,
)
const mapped = computed(() => {
  const l = currentLoc.value
  return l && l.gpsLatitude != null && l.gpsLongitude != null ? l : undefined
})

const published = computed(() => (art.value?.contributions ?? []).filter(c => c.status === 'published'))
const pending = computed(() => (art.value?.contributions ?? []).filter(c => c.status === 'pending'))
const hidden = computed(() => (art.value?.contributions ?? []).filter(c => c.status === 'hidden'))

// --- contribute -------------------------------------------------------------
const form = reactive({ body: '', language: '', mediaUrl: '' })
const submitBusy = ref(false)
const submitError = ref('')
const submitted = ref(false)

async function submitContribution() {
  if (!form.body.trim())
    return
  submitBusy.value = true
  submitError.value = ''
  try {
    await $fetch(`/api/art/${id.value}/contributions`, { method: 'POST', body: { ...form } })
    form.body = ''
    form.language = ''
    form.mediaUrl = ''
    submitted.value = true
    await refresh()
  }
  catch (e: any) {
    submitError.value = e?.data?.statusMessage ?? 'Could not submit'
  }
  finally {
    submitBusy.value = false
  }
}

// --- owner: moderate --------------------------------------------------------
async function moderate(c: Contribution, status: 'published' | 'hidden') {
  await $fetch(`/api/art/contributions/${c.id}`, { method: 'PATCH', body: { status } })
  await refresh()
}

// --- owner: edit the artwork's details --------------------------------------
const editOpen = ref(false)
const editBusy = ref(false)
const editError = ref('')
const editForm = reactive({ name: '', artist: '', description: '', website: '', hometown: '', contactEmail: '' })
function openEdit() {
  const a = art.value
  if (!a)
    return
  editForm.name = a.name ?? ''
  editForm.artist = a.artist ?? ''
  editForm.description = a.description ?? ''
  editForm.website = a.website ?? ''
  editForm.hometown = a.hometown ?? ''
  editForm.contactEmail = a.contactEmail ?? ''
  editError.value = ''
  editOpen.value = true
}
async function saveEdit() {
  if (!editForm.name.trim())
    return
  editBusy.value = true
  editError.value = ''
  try {
    await $fetch(`/api/art/${id.value}/details`, { method: 'PATCH', body: { ...editForm } })
    editOpen.value = false
    await refresh()
  }
  catch (e: any) {
    editError.value = e?.data?.statusMessage ?? 'Could not save'
  }
  finally {
    editBusy.value = false
  }
}

// --- owner: edit the call ---------------------------------------------------
const callEdit = ref(false)
const callDraft = ref('')
const callBusy = ref(false)
function openCallEdit() {
  callDraft.value = art.value?.call ?? ''
  callEdit.value = true
}
async function saveCall() {
  callBusy.value = true
  try {
    await $fetch(`/api/art/${id.value}/call`, { method: 'PUT', body: { call: callDraft.value } })
    callEdit.value = false
    await refresh()
  }
  finally {
    callBusy.value = false
  }
}

useHead(() => ({ title: art.value ? `${art.value.name} — BRC Map` : 'Art — BRC Map' }))
</script>

<template>
  <UContainer class="py-10 sm:py-14">
    <div v-if="error" class="py-16 text-center text-(--ui-text-muted)">
      <UIcon name="i-lucide-frame" class="mx-auto mb-3 size-10 opacity-40" />
      <p>That artwork could not be found.</p>
      <UButton to="/art" variant="link">← Back to all art</UButton>
    </div>

    <template v-else-if="art">
      <UButton to="/art" size="xs" variant="link" class="mb-3 px-0" icon="i-lucide-arrow-left">All art</UButton>

      <div class="mb-2 flex items-start justify-between gap-4">
        <h1 class="font-display text-3xl font-bold uppercase tracking-tight sm:text-4xl">{{ art.name }}</h1>
        <UBadge color="neutral" variant="subtle" class="shrink-0">{{ art.year }}</UBadge>
      </div>
      <p v-if="art.artist" class="mb-1 text-base text-(--ui-text-toned)">by {{ art.artist }}</p>
      <p v-if="currentLoc?.addressString" class="text-sm text-primary">📍 {{ namedAddress(currentLoc.addressString) }}</p>
      <p v-if="art.hometown" class="mt-1 text-sm text-(--ui-text-muted)">🏠 {{ art.hometown }}</p>
      <div v-if="audioForArt(art.name)" class="mt-4 max-w-2xl rounded-xl border border-(--ui-border) bg-(--ui-bg-muted)/40 p-3">
        <p class="mb-2 flex items-center gap-1.5 text-sm font-semibold text-(--ui-text)">
          <UIcon name="i-lucide-headphones" class="size-4 text-primary" />
          Art Audio Tour · track {{ audioForArt(art.name)!.n }}
        </p>
        <AudioTourPlayer :track="audioForArt(art.name)!" />
      </div>
      <p v-if="art.description" class="mt-3 max-w-2xl whitespace-pre-line text-(--ui-text-muted)">{{ art.description }}</p>
      <div class="mt-3 flex flex-wrap gap-3">
        <UButton v-if="art.canManage" size="xs" color="primary" variant="solid" icon="i-lucide-pencil" @click="openEdit">Edit details</UButton>
        <UButton v-if="art.website" :to="art.website" target="_blank" size="xs" variant="subtle" icon="i-lucide-link">Website</UButton>
        <UButton v-if="mapped" :to="`/?lat=${mapped.gpsLatitude}&lng=${mapped.gpsLongitude}`" size="xs" variant="subtle" icon="i-lucide-map-pin">View on map</UButton>
        <UButton v-if="art.owner && !art.isOwner && loggedIn" :to="`/messages/${art.owner.id}`" size="xs" variant="subtle" icon="i-lucide-mail">Message the organizer</UButton>
        <UButton v-else-if="art.owner && !art.isOwner && !loggedIn" to="/?login=1" size="xs" variant="subtle" icon="i-lucide-mail">Log in to message</UButton>
      </div>

      <!-- owner: edit artwork details -->
      <UModal v-model:open="editOpen" title="Edit artwork">
        <template #body>
          <form class="space-y-3" @submit.prevent="saveEdit">
            <UInput v-model="editForm.name" placeholder="Artwork name" class="w-full" />
            <UInput v-model="editForm.artist" placeholder="Artist / maker (optional)" icon="i-lucide-user" class="w-full" />
            <UTextarea v-model="editForm.description" :rows="3" autoresize placeholder="Description" class="w-full" />
            <UInput v-model="editForm.website" type="url" placeholder="Website — https://…" icon="i-lucide-link" class="w-full" />
            <div class="grid grid-cols-2 gap-2">
              <UInput v-model="editForm.hometown" placeholder="Hometown" class="w-full" />
              <UInput v-model="editForm.contactEmail" type="email" placeholder="Contact email" class="w-full" />
            </div>
            <p v-if="editError" class="text-sm text-red-600">{{ editError }}</p>
            <div class="flex gap-2">
              <UButton type="submit" class="flex-1" :loading="editBusy" :disabled="!editForm.name.trim()">Save</UButton>
              <UButton color="neutral" variant="ghost" @click="editOpen = false">Cancel</UButton>
            </div>
          </form>
        </template>
      </UModal>

      <!-- open call -->
      <UCard class="mt-8 border-primary/30 bg-primary/5">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-megaphone" class="size-5 text-primary" />
            <h2 class="font-display text-lg font-bold uppercase tracking-wide">Open call</h2>
          </div>
          <UButton v-if="art.isOwner" size="xs" variant="ghost" icon="i-lucide-pencil" @click="openCallEdit">
            {{ art.call ? 'Edit' : 'Add a call' }}
          </UButton>
        </div>

        <template v-if="callEdit">
          <UTextarea v-model="callDraft" :rows="3" class="mt-3 w-full" placeholder="Ask the community to contribute — e.g. “Translate this phrase into your language; a photo of your handwriting is welcome.”" />
          <div class="mt-2 flex gap-2">
            <UButton size="sm" :loading="callBusy" @click="saveCall">Save</UButton>
            <UButton size="sm" variant="ghost" color="neutral" @click="callEdit = false">Cancel</UButton>
          </div>
        </template>
        <p v-else-if="art.call" class="mt-3 whitespace-pre-line">{{ art.call }}</p>
        <p v-else class="mt-3 text-sm text-(--ui-text-muted)">
          {{ art.isOwner ? 'No open call yet. Add one to invite contributions.' : 'This artwork isn’t taking contributions right now.' }}
        </p>

        <!-- contribute form -->
        <template v-if="art.call && !callEdit">
          <div v-if="loggedIn" class="mt-5 border-t border-primary/20 pt-4">
            <form class="space-y-2" @submit.prevent="submitContribution">
              <UTextarea v-model="form.body" :rows="3" class="w-full" placeholder="Your contribution…" required />
              <div class="flex flex-col gap-2 sm:flex-row">
                <UInput v-model="form.language" class="w-full" placeholder="Language / dialect (optional)" />
                <UInput v-model="form.mediaUrl" class="w-full" placeholder="Link to a photo (optional)" />
              </div>
              <p v-if="submitError" class="text-sm text-red-600">{{ submitError }}</p>
              <div class="flex items-center gap-3">
                <UButton type="submit" size="sm" :loading="submitBusy" :disabled="!form.body.trim()">Submit contribution</UButton>
                <span v-if="submitted" class="text-sm text-(--ui-text-muted)">Thanks! Sent to the artist for approval.</span>
              </div>
            </form>
          </div>
          <p v-else class="mt-5 border-t border-primary/20 pt-4 text-sm text-(--ui-text-muted)">
            <NuxtLink to="/?login=1" class="text-primary underline">Log in</NuxtLink> to contribute.
          </p>
        </template>
      </UCard>

      <!-- owner moderation queue -->
      <section v-if="art.isOwner && (pending.length || hidden.length)" class="mt-8">
        <h3 class="mb-2 font-display text-sm font-bold uppercase tracking-wide text-(--ui-text-muted)">Awaiting your review</h3>
        <div class="space-y-2">
          <UCard v-for="c in [...pending, ...hidden]" :key="c.id" class="border-dashed">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="whitespace-pre-line">{{ c.body }}</p>
                <p class="mt-1 text-xs text-(--ui-text-muted)">
                  <span v-if="c.language">{{ c.language }} · </span>{{ c.authorName || 'Anonymous' }}
                  <UBadge v-if="c.status === 'hidden'" size="xs" color="neutral" variant="subtle" class="ml-1">hidden</UBadge>
                </p>
                <a v-if="c.mediaUrl" :href="c.mediaUrl" target="_blank" rel="noopener noreferrer" class="text-xs text-primary underline">attached link ↗</a>
              </div>
              <div class="flex shrink-0 gap-1">
                <UButton size="xs" color="primary" variant="soft" @click="moderate(c, 'published')">Publish</UButton>
                <UButton v-if="c.status !== 'hidden'" size="xs" color="neutral" variant="ghost" @click="moderate(c, 'hidden')">Hide</UButton>
              </div>
            </div>
          </UCard>
        </div>
      </section>

      <!-- published contributions -->
      <section class="mt-8">
        <h3 class="mb-3 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide">
          Contributions
          <UBadge color="neutral" variant="subtle">{{ published.length }}</UBadge>
        </h3>
        <div v-if="published.length" class="grid gap-3 sm:grid-cols-2">
          <UCard v-for="c in published" :key="c.id">
            <p class="whitespace-pre-line">{{ c.body }}</p>
            <p class="mt-2 text-xs text-(--ui-text-muted)">
              <span v-if="c.language" class="font-medium text-(--ui-text)">{{ c.language }}</span>
              <span v-if="c.language"> · </span>{{ c.authorName || 'Anonymous' }}
            </p>
            <a v-if="c.mediaUrl" :href="c.mediaUrl" target="_blank" rel="noopener noreferrer" class="text-xs text-primary underline">attached link ↗</a>
            <div v-if="art.isOwner" class="mt-2">
              <UButton size="xs" color="neutral" variant="ghost" @click="moderate(c, 'hidden')">Hide</UButton>
            </div>
          </UCard>
        </div>
        <p v-else class="text-sm text-(--ui-text-muted)">No contributions yet{{ art.call ? ' — be the first.' : '.' }}</p>
      </section>
    </template>
  </UContainer>
</template>
