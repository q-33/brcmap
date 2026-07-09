<script setup lang="ts">
// Meshtastic mesh control — connect a LoRa radio, see your people, chat off-grid.
// Renders a floating button + a togglable panel. Wrap usages in <ClientOnly>
// (Web Bluetooth / Web Serial are browser-only and unavailable on iOS).
const { supported, status, connected, error, nodesList, locatedPeers, messages, connect, disconnect, sendText, clearMesh } = useMeshtastic()

const open = ref(false)
const draft = ref('')
const anySupported = computed(() => supported.ble || supported.serial)

function relHeard(sec?: number) {
  if (!sec)
    return ''
  const m = Math.floor((Date.now() / 1000 - sec) / 60)
  if (m < 1)
    return 'now'
  if (m < 60)
    return `${m}m`
  return `${Math.floor(m / 60)}h`
}

async function send() {
  const t = draft.value.trim()
  if (!t)
    return
  draft.value = ''
  await sendText(t)
}
</script>

<template>
  <div>
    <!-- floating toggle -->
    <UButton
      :color="connected ? 'primary' : 'neutral'"
      variant="solid"
      :icon="connected ? 'i-lucide-radio' : 'i-lucide-radio-tower'"
      class="fixed bottom-4 left-4 z-30 shadow-lg"
      @click="open = !open"
    >
      Mesh
      <span
        class="ml-1 inline-block size-2 rounded-full"
        :class="connected ? 'bg-green-400' : (status === 'disconnected' ? 'bg-neutral-400' : 'bg-amber-400 animate-pulse')"
      />
    </UButton>

    <div
      v-if="open"
      class="fixed bottom-16 left-4 z-30 flex max-h-[70vh] w-80 flex-col overflow-hidden rounded-xl border border-(--ui-border) bg-(--ui-bg) shadow-2xl"
    >
      <div class="flex items-center justify-between border-b border-(--ui-border) px-3 py-2">
        <p class="font-display text-sm font-semibold">
          Mesh radio
        </p>
        <div class="flex items-center gap-1">
          <UButton v-if="connected" size="xs" color="neutral" variant="ghost" @click="disconnect">
            Disconnect
          </UButton>
          <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" square aria-label="Close" @click="open = false" />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-3 text-sm">
        <p v-if="error" class="mb-2 rounded bg-error/10 px-2 py-1 text-xs text-error">
          {{ error }}
        </p>

        <!-- not supported (iOS / Firefox) -->
        <div v-if="!anySupported" class="space-y-2 text-(--ui-text-muted)">
          <p>Connecting a Meshtastic radio needs <b>Chrome or Edge</b> on desktop or Android.</p>
          <p>On iPhone, use the official <b>Meshtastic</b> app — this map can't reach a radio directly on iOS yet.</p>
        </div>

        <!-- disconnected: connect options -->
        <div v-else-if="!connected && status === 'disconnected'" class="space-y-2">
          <p class="text-(--ui-text-muted)">
            Connect your radio to see your people on the map and chat with no signal.
          </p>
          <UButton v-if="supported.ble" block icon="i-lucide-bluetooth" color="primary" variant="soft" @click="connect('ble')">
            Connect via Bluetooth
          </UButton>
          <UButton v-if="supported.serial" block icon="i-lucide-usb" color="primary" variant="soft" @click="connect('serial')">
            Connect via USB
          </UButton>
          <p v-if="nodesList.length" class="border-t border-(--ui-border) pt-2 text-xs text-(--ui-text-muted)">
            Last seen: {{ nodesList.length }} {{ nodesList.length === 1 ? 'person' : 'people' }}<span v-if="locatedPeers.length"> · {{ locatedPeers.length }} on the map</span>.
          </p>
        </div>

        <!-- connecting -->
        <div v-else-if="!connected" class="flex items-center gap-2 text-(--ui-text-muted)">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          {{ status === 'configuring' ? 'Reading the mesh…' : 'Connecting…' }}
        </div>

        <!-- connected: nodes + chat -->
        <div v-else class="space-y-3">
          <div>
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
              People ({{ nodesList.length }}) · {{ locatedPeers.length }} on map
            </p>
            <ul class="space-y-1">
              <li v-for="n in nodesList" :key="n.num" class="flex items-center justify-between gap-2">
                <span class="flex min-w-0 items-center gap-1.5">
                  <span class="size-2 shrink-0 rounded-full" :class="n.isSelf ? 'bg-amber-500' : (n.lat != null ? 'bg-green-500' : 'bg-neutral-300')" />
                  <span class="truncate">{{ n.longName || n.shortName || `!${n.num.toString(16)}` }}</span>
                  <span v-if="n.isSelf" class="text-xs text-(--ui-text-muted)">(you)</span>
                </span>
                <span class="flex shrink-0 items-center gap-1.5 text-xs text-(--ui-text-muted)">
                  <span v-if="n.batteryLevel != null">{{ n.batteryLevel }}%</span>
                  <span v-if="n.lastHeard">· {{ relHeard(n.lastHeard) }}</span>
                </span>
              </li>
            </ul>
          </div>

          <div>
            <p class="mb-1 text-xs font-semibold uppercase tracking-wide text-(--ui-text-muted)">
              Mesh chat
            </p>
            <div class="max-h-40 space-y-1 overflow-y-auto rounded bg-(--ui-bg-muted) p-2 text-xs">
              <p v-if="!messages.length" class="text-(--ui-text-muted)">
                No messages yet.
              </p>
              <p v-for="m in messages" :key="m.id">
                <b>{{ m.outbound ? 'You' : (m.fromName || `!${m.from.toString(16)}`) }}:</b> {{ m.text }}
              </p>
            </div>
            <form class="mt-2 flex gap-1" @submit.prevent="send">
              <UInput v-model="draft" placeholder="Message the mesh…" size="sm" class="flex-1" />
              <UButton type="submit" size="sm" icon="i-lucide-send" :disabled="!draft.trim()" square aria-label="Send" />
            </form>
          </div>
        </div>

        <button
          v-if="nodesList.length || messages.length"
          class="mt-3 text-xs text-(--ui-text-muted) underline-offset-2 hover:text-error hover:underline"
          @click="clearMesh"
        >
          Clear saved mesh data
        </button>
      </div>
    </div>
  </div>
</template>
