<script setup lang="ts">
const { loggedIn, user } = useUserSession()

const links = [
  { label: 'Map', to: '/', icon: 'i-lucide-map' },
  { label: 'Camps', to: '/camps', icon: 'i-lucide-tent' },
  { label: 'Events', to: '/events', icon: 'i-lucide-calendar' },
  { label: 'About', to: '/about', icon: 'i-lucide-info' },
]

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await useUserSession().fetch()
  await navigateTo('/')
}
</script>

<template>
  <div class="playa-bg flex min-h-full flex-col">
    <header class="sticky top-0 z-20 border-b border-(--ui-border)/60 bg-(--ui-bg)/70 backdrop-blur-xl">
      <UContainer class="flex h-16 items-center justify-between gap-4">
        <NuxtLink to="/" class="group flex items-center gap-2">
          <span class="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <UIcon name="i-lucide-flame" class="size-5" />
          </span>
          <span class="font-display text-lg font-bold uppercase tracking-wide">Burner<span class="text-primary">Map</span></span>
        </NuxtLink>

        <nav class="hidden items-center gap-1 sm:flex">
          <UButton
            v-for="l in links"
            :key="l.to"
            :to="l.to"
            :icon="l.icon"
            variant="ghost"
            color="neutral"
            size="sm"
          >
            {{ l.label }}
          </UButton>
        </nav>

        <div class="flex items-center gap-2">
          <UColorModeButton />
          <UButton v-if="loggedIn" size="sm" color="neutral" variant="soft" icon="i-lucide-user" @click="logout">
            {{ user?.displayName || 'Log out' }}
          </UButton>
          <UButton v-else to="/?login=1" size="sm" color="primary" variant="soft">
            Log in
          </UButton>
        </div>
      </UContainer>
    </header>

    <main class="flex-1">
      <slot />
    </main>

    <footer class="border-t border-(--ui-border)/60 py-8">
      <UContainer class="flex flex-col items-center gap-2 text-center text-sm text-(--ui-text-muted)">
        <p class="font-display font-semibold text-(--ui-text)">Burner<span class="text-primary">Map</span></p>
        <p>An unofficial, community map of Black Rock City. Pins are approximate.</p>
        <div class="flex items-center gap-4 text-xs">
          <NuxtLink to="/about" class="hover:text-primary">About</NuxtLink>
          <a href="https://github.com/q-33/burnermap" target="_blank" rel="noopener" class="hover:text-primary">GitHub</a>
        </div>
      </UContainer>
    </footer>
  </div>
</template>
