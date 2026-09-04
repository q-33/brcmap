<template>
  <UApp>
    <div class="flex h-dvh flex-col overflow-hidden">
      <CountdownBanner class="shrink-0" />
      <BurnAnnouncement class="shrink-0" />
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
