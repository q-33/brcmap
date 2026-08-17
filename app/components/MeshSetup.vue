<script setup lang="ts">
import QRCode from 'qrcode'
import { PLAYA_CHANNELS } from '~~/lib/mesh/brcmapChannel'
import { buildChannelUrl, randomPsk } from '~~/lib/mesh/channelSet'

// Generate a Meshtastic channel QR/URL that ADDS our channel(s) to a radio which
// is already running Burning Mesh firmware: BRC Map, optionally with a private
// crew channel. Client-only.
//
// It carries NO radio settings and never a primary channel — the firmware owns
// the event's preset/frequency slot and the "Everyone" channel on 0, and
// overriding either would drop the radio off the mesh. Scan as ADD, not Replace.
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
    // Both modes add secondaries only; the radio keeps Everyone on channel 0.
    const channels = mode.value === 'public'
      ? PLAYA_CHANNELS
      : [...PLAYA_CHANNELS, { name: (crewName.value.trim() || 'Crew').slice(0, 11), psk: crewPsk.value }]
    url.value = buildChannelUrl(channels)
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
        Playa mesh
      </button>
      <button
        type="button"
        class="flex-1 rounded-md py-1.5 font-medium transition"
        :class="mode === 'crew' ? 'bg-(--ui-bg) shadow-sm' : 'text-(--ui-text-muted)'"
        @click="mode = 'crew'"
      >
        + private crew channel
      </button>
    </div>

    <p class="text-sm text-(--ui-text-muted)">
      <template v-if="mode === 'public'">
        Adds <b>BRC Map</b> as a channel on a radio already running the Burning Mesh firmware, so your
        people show up on each other's map. Choose <b>Add</b>, not Replace — your <b>Everyone</b> channel
        stays on 0. No radio settings are changed.
      </template>
      <template v-else>
        Everything above, plus a brand-new private channel just for your crew. Share the QR with them;
        only people who scan it can read it. <b>Everyone</b> stays on channel 0 either way, so you can
        still message anyone at the event.
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
        <li>Flash the <b>Burning Mesh 2026</b> firmware first (see the steps above), then open the official <b>Meshtastic</b> app with your radio paired.</li>
        <li><b>Scan this QR</b> (or open the link on that phone). It adds the channel only — your radio's region, preset and frequency slot are left exactly as the firmware set them.</li>
        <li>Confirm as <b>Add</b> (never Replace). BRC Map lands as channel 1{{ mode === 'crew' ? ', with your crew channel added too' : '' }}.</li>
      </ol>
    </div>
  </div>
</template>
