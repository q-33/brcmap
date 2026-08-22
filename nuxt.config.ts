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
      // Same package, same problem, different shape: tslog (bundled inside
      // @meshtastic/core) calls process.cwd() UNGUARDED while formatting the
      // file path in a log line. `process` does not exist in a browser, so that
      // is a ReferenceError — "process is not defined" — and it fires the moment
      // the mesh code logs anything, which is why Connect via Bluetooth died
      // before it could reach the radio.
      //
      // Patched in that one file rather than by defining a global `process`.
      // Inventing that global would tell every other library in the bundle it is
      // running under Node, and several change behaviour on exactly that check.
      // The package's other reference is a `typeof process` guard, which must
      // keep seeing no process so it takes the browser path — so the rewrite is
      // scoped to the single broken call.
      config.plugins ??= []
      config.plugins.push({
        name: 'brcmap:meshtastic-no-process-cwd',
        enforce: 'pre',
        transform(code: string, id: string) {
          if (!id.includes('@meshtastic') || !/(?<![\w.$])process(?![\w$])/.test(code))
            return null
          const patched = code
            // there is no working directory in a browser; the result is only used
            // to trim a prefix off a file path in a log line
            .replace(/process\.cwd\(\)/g, '\'\'')
            // Everything else becomes a property lookup on globalThis, which is
            // merely `undefined` instead of a ReferenceError. That matters for
            // `process?.version` in particular: optional chaining guards a null
            // VALUE, not an undeclared NAME, so it throws just as hard on its own.
            // `typeof globalThis.process` still reports "undefined", so the
            // package's browser-detection guards keep choosing the browser path.
            .replace(/(?<![\w.$])process(?![\w$])/g, 'globalThis.process')
          return { code: patched, map: null }
        },
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
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      script: [
        // localStorage guard — runs before any app/vendor JS. In-app webviews
        // (notably the Facebook browser, where links arrive with ?fbclid=…) can
        // make even READING window.localStorage throw "Access is denied for this
        // document". Unguarded, the first dependency to touch it (theme/color-
        // mode restore, etc.) crashes hydration into a 500 page. If the native
        // store throws, we shadow it with an in-memory shim so the app still
        // runs (storage is best-effort; it just won't persist in that webview).
        {
          key: 'ls-guard',
          tagPriority: 'critical',
          tagPosition: 'head',
          innerHTML: '(function(){try{window.localStorage.getItem("__lsprobe__")}catch(e){try{var m={},s={getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null}};Object.defineProperty(s,"length",{get:function(){return Object.keys(m).length}});Object.defineProperty(window,"localStorage",{configurable:true,value:s})}catch(e2){}}})();',
        },
      ],
    },
  },
  runtimeConfig: {
    // server-only secret, read from DATABASE_URL env (.env / DO secret)
    databaseUrl: process.env.DATABASE_URL,
    // Tempest (WeatherFlow) API key, for the local weather stations burners bring
    // out. Server-only: the key reaches every station on the owner's account, so
    // it never goes near the browser. Unset until someone hands us one — the
    // weather page runs on Open-Meteo alone and says nothing about it.
    tempestApiKey: process.env.TEMPEST_API_KEY ?? '',
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
