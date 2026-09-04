<script setup lang="ts">
const route = useRoute()
const onMap = computed(() => route.path === '/')
</script>

<template>
  <UApp>
    <div class="flex h-dvh flex-col overflow-hidden">
      <!-- The map carries all of this in its own top bar, with a live countdown
           instead of a sentence. Stacking these above it put four full-width
           bands over the city and said "Titanic's End, tonight at sunset" twice
           in a row. Every other page has no such bar, so they still announce
           there. -->
      <template v-if="!onMap">
        <CountdownBanner class="shrink-0" />
        <BurnAnnouncement class="shrink-0" />
      </template>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </div>
      <!-- The radio lives here, above the router, so playback survives every
           page change. Renders nothing until someone presses play. -->
      <ClientOnly>
        <RadioBar />
      </ClientOnly>
    </div>
  </UApp>
</template>
