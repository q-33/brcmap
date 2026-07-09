<script setup lang="ts">
// "Download for the playa" control — warms the offline caches so the map + data
// work with no signal. Lives in the footer; only shows where service workers are
// supported. Wrap usages in <ClientOnly> (it depends on navigator/localStorage).
const { supported, syncing, progress, lastSyncedAt, error, downloadForPlaya } = useOfflineReady()

const pct = computed(() => Math.round(progress.value * 100))

const lastLabel = computed(() => {
  if (!lastSyncedAt.value)
    return null
  const m = Math.floor((Date.now() - lastSyncedAt.value) / 60000)
  if (m < 1)
    return 'just now'
  if (m < 60)
    return `${m} min ago`
  const h = Math.floor(m / 60)
  if (h < 24)
    return `${h} h ago`
  return `${Math.floor(h / 24)} d ago`
})
</script>

<template>
  <div v-if="supported" class="flex flex-col items-center gap-1">
    <UButton
      :loading="syncing"
      icon="i-lucide-cloud-download"
      color="neutral"
      variant="soft"
      size="sm"
      @click="downloadForPlaya"
    >
      {{ syncing ? `Downloading… ${pct}%` : (lastSyncedAt ? 'Update offline map' : 'Download for the playa') }}
    </UButton>
    <p v-if="lastSyncedAt && !syncing" class="flex items-center gap-1 text-xs text-(--ui-text-muted)">
      <UIcon name="i-lucide-circle-check" class="size-3.5 text-primary" />
      Ready for the playa · updated {{ lastLabel }}
    </p>
    <p v-else-if="!syncing" class="max-w-xs text-center text-xs text-(--ui-text-muted)">
      Save the map + camps for use with no signal on the playa.
    </p>
    <p v-if="error" class="text-xs text-error">
      {{ error }}
    </p>
  </div>
</template>
