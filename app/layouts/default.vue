<script setup lang="ts">
const { loggedIn, user } = useUserSession()

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await useUserSession().fetch()
  await navigateTo('/')
}
</script>

<template>
  <div class="min-h-dvh bg-(--ui-bg)">
    <header class="sticky top-0 z-10 border-b border-(--ui-border) bg-(--ui-bg)/80 backdrop-blur">
      <UContainer class="flex h-14 items-center justify-between gap-4">
        <nav class="flex items-center gap-4">
          <NuxtLink to="/" class="font-bold">BurnerMap</NuxtLink>
          <NuxtLink to="/" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text)">Map</NuxtLink>
          <NuxtLink to="/camps" class="text-sm text-(--ui-text-muted) hover:text-(--ui-text)">Camps</NuxtLink>
        </nav>
        <UButton v-if="loggedIn" size="sm" variant="soft" @click="logout">
          {{ user?.displayName || 'Log out' }}
        </UButton>
      </UContainer>
    </header>
    <UContainer class="py-6">
      <slot />
    </UContainer>
  </div>
</template>
