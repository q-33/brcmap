// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-auth-utils'],
  css: ['~/assets/css/main.css'],
  colorMode: {
    preference: 'light',
    fallback: 'light',
  },
  app: {
    head: {
      title: 'BurnerMap',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Find your people on the playa. Mark and discover camp locations on the Black Rock City map.' },
        { name: 'theme-color', content: '#ece4d2' },
      ],
    },
  },
  runtimeConfig: {
    // server-only secret, read from DATABASE_URL env (.env / DO secret)
    databaseUrl: process.env.DATABASE_URL,
    public: {
      // The surveyed golden spike as "lat,lng" (NUXT_PUBLIC_GOLDEN_SPIKE). Set
      // this DO env var when Burning Man publishes the 2026 coordinate and the
      // whole city re-snaps on restart — no code change or rebuild needed.
      goldenSpike: process.env.NUXT_PUBLIC_GOLDEN_SPIKE ?? '',
    },
  },
})
