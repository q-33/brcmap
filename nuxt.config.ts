// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },
  app: {
    head: {
      title: 'BurnerMap',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Find your people on the playa. Mark and discover camp locations on the Black Rock City map.' },
        { name: 'theme-color', content: '#1c1917' },
      ],
    },
  },
  runtimeConfig: {
    // server-only secret, read from DATABASE_URL env (.env / DO secret)
    databaseUrl: process.env.DATABASE_URL,
  },
})
