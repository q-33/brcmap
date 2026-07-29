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
    </div>
  </UApp>
</template>
