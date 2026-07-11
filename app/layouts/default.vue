<script setup lang="ts">
const { loggedIn, user } = useUserSession()
const { isAdmin, unreadMessages } = useMe()

// Admin is intentionally NOT in the top nav — admins reach it from the account
// dropdown ("Admin dashboard") instead.
const links = computed(() => [
  { label: 'Camps', to: '/camps', icon: 'i-lucide-tent', badge: 0 },
  { label: 'Art', to: '/art', icon: 'i-lucide-palette', badge: 0 },
  { label: 'Events', to: '/events', icon: 'i-lucide-calendar', badge: 0 },
  { label: 'Gate', to: '/gate', icon: 'i-lucide-traffic-cone', badge: 0 },
  { label: 'Live', to: '/live', icon: 'i-lucide-radio', badge: 0 },
  { label: 'Guide', to: '/guide', icon: 'i-lucide-compass', badge: 0 },
])

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await useUserSession().fetch()
  await navigateTo('/')
}

// Account dropdown — clicking the name opens this menu (it must NOT log out).
const accountMenu = computed(() => {
  const items: any[] = [
    [{ label: user.value?.displayName || user.value?.email || 'Account', type: 'label' as const }],
    [{ label: 'Messages', icon: 'i-lucide-mail', to: '/messages' }],
  ]
  if (isAdmin.value)
    items.push([{ label: 'Admin dashboard', icon: 'i-lucide-shield', to: '/admin' }])
  items.push([{ label: 'Log out', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: logout }])
  return items
})
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

        <!-- always-visible link back to the map -->
        <UButton to="/" icon="i-lucide-map" size="sm" color="neutral" variant="soft" class="shrink-0">Map</UButton>

        <nav class="hidden items-center gap-1 sm:flex">
          <UChip
            v-for="l in links"
            :key="l.to"
            :text="l.badge"
            :show="l.badge > 0"
            color="primary"
            size="lg"
          >
            <UButton
              :to="l.to"
              :icon="l.icon"
              variant="ghost"
              color="neutral"
              size="sm"
            >
              {{ l.label }}
            </UButton>
          </UChip>
        </nav>

        <div class="flex items-center gap-2">
          <UColorModeButton />
          <UChip v-if="loggedIn" :text="unreadMessages" :show="unreadMessages > 0" color="primary" size="2xl">
            <UButton to="/messages" size="sm" color="neutral" variant="ghost" icon="i-lucide-mail" square aria-label="Messages" />
          </UChip>
          <UDropdownMenu v-if="loggedIn" :items="accountMenu" :content="{ align: 'end', sideOffset: 6 }">
            <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-user" trailing-icon="i-lucide-chevron-down">
              <span class="hidden max-w-28 truncate sm:inline">{{ user?.displayName || 'Account' }}</span>
            </UButton>
          </UDropdownMenu>
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
        <ClientOnly>
          <OfflineReady class="mb-2" />
        </ClientOnly>
        <p class="font-display font-semibold text-(--ui-text)">Burner<span class="text-primary">Map</span></p>
        <p>An unofficial, community map of Black Rock City. Pins are approximate.</p>
        <div class="flex items-center gap-4 text-xs">
          <NuxtLink to="/about" class="hover:text-primary">About</NuxtLink>
          <NuxtLink to="/contact" class="hover:text-primary">Contact</NuxtLink>
          <a href="https://github.com/q-33/burnermap" target="_blank" rel="noopener" class="hover:text-primary">GitHub</a>
        </div>
      </UContainer>
    </footer>
  </div>
</template>
