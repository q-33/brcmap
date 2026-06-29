<script setup lang="ts">
import { formatAddressNamed, parseAddress } from '~~/lib/brc/geocode'

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
  call: string | null
  isOwner: boolean
  owner: { id: string, displayName: string | null, playaName: string | null } | null
  myClaim: { status: string } | null
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

// --- claim this artwork (ownerless art only) --------------------------------
const claimOpen = ref(false)
const claimMessage = ref('')
const claimBusy = ref(false)
const claimError = ref('')
const claimStatus = computed(() => art.value?.myClaim?.status ?? null)
function openClaim() {
  claimMessage.value = ''
  claimError.value = ''
  claimOpen.value = true
}
async function submitClaim() {
  claimBusy.value = true
  claimError.value = ''
  try {
    await $fetch(`/api/art/${id.value}/claims`, { method: 'POST', body: { message: claimMessage.value } })
    claimOpen.value = false
    await refresh()
  }
  catch (e: any) {
    claimError.value = e?.data?.statusMessage ?? 'Could not submit your claim'
  }
  finally {
    claimBusy.value = false
  }
}

useHead(() => ({ title: art.value ? `${art.value.name} — BurnerMap` : 'Art — BurnerMap' }))
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
      <p v-if="art.description" class="mt-3 max-w-2xl whitespace-pre-line text-(--ui-text-muted)">{{ art.description }}</p>
      <div class="mt-3 flex flex-wrap gap-3">
        <UButton v-if="art.website" :to="art.website" target="_blank" size="xs" variant="subtle" icon="i-lucide-link">Website</UButton>
        <UButton v-if="mapped" :to="`/?lat=${mapped.gpsLatitude}&lng=${mapped.gpsLongitude}`" size="xs" variant="subtle" icon="i-lucide-map-pin">View on map</UButton>
        <UButton v-if="art.owner && !art.isOwner && loggedIn" :to="`/messages/${art.owner.id}`" size="xs" variant="subtle" icon="i-lucide-mail">Message the organizer</UButton>
        <UButton v-else-if="art.owner && !art.isOwner && !loggedIn" to="/?login=1" size="xs" variant="subtle" icon="i-lucide-mail">Log in to message</UButton>
        <!-- Claim an official, ownerless artwork -->
        <UButton v-if="!art.owner && loggedIn && claimStatus !== 'pending'" size="xs" color="primary" variant="solid" icon="i-lucide-hand" @click="openClaim">
          {{ claimStatus === 'rejected' ? 'Claim again' : 'Claim this artwork' }}
        </UButton>
        <UButton v-else-if="!art.owner && !loggedIn" to="/?login=1" size="xs" color="primary" variant="subtle" icon="i-lucide-hand">Log in to claim</UButton>
      </div>

      <!-- claim status banners -->
      <div v-if="!art.owner && claimStatus === 'pending'" class="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-(--ui-text-toned)">
        <UIcon name="i-lucide-clock" class="size-4 shrink-0 text-primary" />
        Your claim is awaiting admin review. You'll get a message when it's decided.
      </div>
      <div v-else-if="!art.owner && claimStatus === 'rejected'" class="mt-3 flex items-center gap-2 rounded-lg border border-(--ui-border) px-3 py-2 text-sm text-(--ui-text-muted)">
        <UIcon name="i-lucide-info" class="size-4 shrink-0" />
        Your previous claim wasn't approved.
      </div>

      <UModal v-model:open="claimOpen" title="Claim this artwork">
        <template #body>
          <form class="space-y-3" @submit.prevent="submitClaim">
            <p class="text-sm text-(--ui-text-muted)">
              Request to manage <b>{{ art.name }}</b>. An admin reviews each claim before granting access. Add anything that helps verify you're the artist (links, contact, your role) — optional but it speeds approval.
            </p>
            <UTextarea v-model="claimMessage" :rows="4" class="w-full" placeholder="e.g. I'm the lead artist — here's our project page / Instagram, and the email on file is…" />
            <p v-if="claimError" class="text-sm text-error">{{ claimError }}</p>
            <div class="flex gap-2">
              <UButton type="submit" :loading="claimBusy">Submit claim</UButton>
              <UButton variant="ghost" color="neutral" @click="claimOpen = false">Cancel</UButton>
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
