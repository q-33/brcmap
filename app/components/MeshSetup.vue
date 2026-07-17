<script setup lang="ts">
import QRCode from 'qrcode'
import { BRCMAP_CHANNEL } from '~~/lib/mesh/brcmapChannel'
import { buildChannelUrl, randomPsk } from '~~/lib/mesh/channelSet'

// Generate a Meshtastic channel QR/URL to get a radio onto the BRC Map mesh
// (public community channel) or a private crew channel. Client-only.
const mode = ref<'public' | 'crew'>('public')
const crewName = ref('My Crew')
const crewPsk = ref<Uint8Array>(randomPsk())
const url = ref('')
const qr = ref('')
const busy = ref(false)
const err = ref('')
const copied = ref(false)

async function regen() {
  busy.value = true
  err.value = ''
  try {
    const channel = mode.value === 'public'
      ? BRCMAP_CHANNEL
      : { name: (crewName.value.trim() || 'Crew').slice(0, 11), psk: crewPsk.value }
    url.value = buildChannelUrl(channel)
    qr.value = await QRCode.toDataURL(url.value, { margin: 1, width: 320, errorCorrectionLevel: 'M' })
  }
  catch (e) {
    err.value = 'Could not generate the channel QR. Try reloading.'
    console.error('[MeshSetup]', e)
  }
  finally {
    busy.value = false
  }
}
watch([mode, crewName, crewPsk], regen)
onMounted(regen)

function newCrewKey() {
  crewPsk.value = randomPsk()
}
async function copyUrl() {
  await navigator.clipboard?.writeText(url.value).catch(() => {})
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}
</script>

<template>
  <div class="space-y-4">
    <!-- mode toggle -->
    <div class="flex gap-1 rounded-lg bg-(--ui-bg-muted) p-0.5 text-sm">
      <button
        type="button"
        class="flex-1 rounded-md py-1.5 font-medium transition"
        :class="mode === 'public' ? 'bg-(--ui-bg) shadow-sm' : 'text-(--ui-text-muted)'"
        @click="mode = 'public'"
      >
        BRC Map mesh
      </button>
      <button
        type="button"
        class="flex-1 rounded-md py-1.5 font-medium transition"
        :class="mode === 'crew' ? 'bg-(--ui-bg) shadow-sm' : 'text-(--ui-text-muted)'"
        @click="mode = 'crew'"
      >
        Private crew channel
      </button>
    </div>

    <p class="text-sm text-(--ui-text-muted)">
      <template v-if="mode === 'public'">
        The shared, public BRC Map channel — everyone on it can see each other on the map and chat
        off-grid. Region US · LONG_FAST · no internet needed.
      </template>
      <template v-else>
        A brand-new private channel just for your crew. Share the QR with them; only people who scan it
        join. Position rides the primary channel, so this replaces the public one.
      </template>
    </p>

    <div v-if="mode === 'crew'" class="flex items-end gap-2">
      <label class="flex-1 text-xs text-(--ui-text-muted)">
        Channel name
        <UInput v-model="crewName" maxlength="11" placeholder="My Crew" class="mt-1 w-full" />
      </label>
      <UButton icon="i-lucide-refresh-cw" color="neutral" variant="soft" aria-label="New key" @click="newCrewKey">
        New key
      </UButton>
    </div>

    <!-- QR -->
    <div class="flex justify-center">
      <div class="rounded-2xl bg-white p-3 shadow-sm">
        <img v-if="qr" :src="qr" alt="Meshtastic channel QR" class="size-56" width="224" height="224">
        <div v-else-if="err" class="flex size-56 items-center justify-center px-4 text-center text-xs text-red-600">
          {{ err }}
        </div>
        <div v-else class="flex size-56 items-center justify-center text-neutral-400">
          <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" />
        </div>
      </div>
    </div>

    <!-- link + copy -->
    <div class="flex items-center gap-2">
      <UInput :model-value="url" readonly class="flex-1 font-mono text-xs" :ui="{ base: 'truncate' }" />
      <UButton :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" color="neutral" variant="soft" :disabled="busy" @click="copyUrl">
        {{ copied ? 'Copied' : 'Copy' }}
      </UButton>
    </div>

    <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg-muted)/40 p-3 text-sm text-(--ui-text-toned)">
      <p class="mb-1 font-semibold text-(--ui-text)">How to join</p>
      <ol class="list-decimal space-y-1 pl-5">
        <li>Open the official <b>Meshtastic</b> app with your radio paired.</li>
        <li><b>Scan this QR</b> (or open the link on that phone) — it sets the channel, region, and preset in one step.</li>
        <li>Confirm the import. You'll now appear on the map for everyone else on the {{ mode === 'public' ? 'BRC Map mesh' : 'crew channel' }}.</li>
      </ol>
    </div>
  </div>
</template>
