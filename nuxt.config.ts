import { fileURLToPath } from 'node:url'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  hooks: {
    // @meshtastic/core (via its tslog logger) statically imports node built-ins
    // os/path/util. It's only ever dynamically imported client-side, so shim
    // those for the browser build; the Nitro server keeps the real modules.
    'vite:extendConfig': (rawConfig, { isClient }) => {
      if (!isClient)
        return
      const config = rawConfig as any
      config.resolve ??= {}
      config.resolve.alias ??= {}
      Object.assign(config.resolve.alias, {
        os: fileURLToPath(new URL('./shims/os.mjs', import.meta.url)),
        path: fileURLToPath(new URL('./shims/path.mjs', import.meta.url)),
        util: fileURLToPath(new URL('./shims/util.mjs', import.meta.url)),
      })
    },
  },
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui', 'nuxt-auth-utils', '@vite-pwa/nuxt'],
  css: ['~/assets/css/main.css'],
  // Offline-first PWA: installable, and (once opened online) the app shell + map
  // code + last-synced data are cached so the whole city map works with no signal
  // on the playa. Custom service worker in service-worker/sw.ts.
  pwa: {
    strategies: 'injectManifest',
    srcDir: 'service-worker',
    filename: 'sw.ts',
    registerType: 'autoUpdate',
    injectManifest: {
      globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff,woff2,pbf,json}'],
      // MapLibre GL is a large single chunk; raise the precache size ceiling.
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    },
    manifest: {
      name: 'BRC Map',
      short_name: 'BRC Map',
      description: 'Find your people on the playa. The Black Rock City map, offline-ready.',
      lang: 'en',
      theme_color: '#ece4d2',
      background_color: '#ece4d2',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
      icons: [
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'maskable-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    client: {
      installPrompt: true,
    },
    // The service worker only runs in a production build; `nuxt dev` stays clean.
    devOptions: {
      enabled: false,
      type: 'module',
    },
  },
  colorMode: {
    preference: 'light',
    fallback: 'light',
  },
  app: {
    head: {
      title: 'BRC Map',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Find your people on the playa. Mark and discover camp locations on the Black Rock City map.' },
        { name: 'theme-color', content: '#ece4d2' },
        // iOS "Add to Home Screen" (iOS ignores the web manifest for installs)
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
        { name: 'apple-mobile-web-app-title', content: 'BRC Map' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },
  runtimeConfig: {
    // server-only secret, read from DATABASE_URL env (.env / DO secret)
    databaseUrl: process.env.DATABASE_URL,
    // nuxt-auth-utils session: bound the sealed cookie's lifetime so a captured
    // cookie can't be replayed indefinitely (there's no server-side revocation).
    session: {
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
    public: {
      // The surveyed golden spike as "lat,lng" (NUXT_PUBLIC_GOLDEN_SPIKE). Set
      // this DO env var when Burning Man publishes the 2026 coordinate and the
      // whole city re-snaps on restart — no code change or rebuild needed.
      goldenSpike: process.env.NUXT_PUBLIC_GOLDEN_SPIKE ?? '',
    },
  },
  fonts: {
    // @nuxt/fonts (via fontless) prefixes every real @font-face src with a
    // `local("Inter SemiBold")`-style hint. If a visitor has *any* font named
    // "Inter"/"Oswald"/"Roboto Mono" installed locally (design tools ship
    // these), the browser renders from THAT instead of our known-good exact
    // subset — producing scrambled glyphs on some machines, worst on the
    // semibold weights used in titles/nav/the account dropdown. Disabling the
    // local() fallbacks forces every client to download the correct woff2.
    // (Doing this at the source — not a post-build CSS rewrite — also changes
    // the hashed CSS filename, so cached/immutable copies actually get busted.)
    experimental: {
      disableLocalFallbacks: true,
    },
  },
})
