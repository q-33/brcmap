/// <reference lib="webworker" />
// BurnerMap offline service worker (injectManifest strategy).
//
// The playa has no cell/internet, so this SW is what makes the app usable there:
// once you've opened BurnerMap online, the app shell, the map code, and the last
// data you saw are all cached and served offline. The map geometry itself is
// generated in-browser (no tiles), so with the shell + fonts cached the whole
// city renders with zero network.
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute, setCatchHandler } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

// Precache the built app shell (JS/CSS/icons/fonts) injected at build time.
precacheAndRoute(self.__WB_MANIFEST)

// Navigations + any same-origin HTML document (incl. a warmed `fetch('/')`):
// NetworkFirst so an online load gets the fresh render, but offline (or on a slow
// playa hotspot) we serve the last cached page. Nuxt is a SPA after hydration, so
// the cached shell + client-side routing + cached /api cover every in-app route.
const pagesStrategy = new NetworkFirst({
  cacheName: 'burnermap-pages',
  networkTimeoutSeconds: 3,
  plugins: [new CacheableResponsePlugin({ statuses: [200] })],
})
registerRoute(
  ({ request, sameOrigin }) => request.method === 'GET' && sameOrigin
    && (request.mode === 'navigate' || (request.headers.get('accept')?.includes('text/html') ?? false)),
  pagesStrategy,
)

// Offline hard-reload of a route we never cached → fall back to the home shell,
// which then client-routes to wherever the user was.
setCatchHandler(async ({ request }) => {
  if (request.mode === 'navigate' || request.destination === 'document') {
    const shell = await caches.match('/', { ignoreSearch: true })
    if (shell)
      return shell
  }
  return Response.error()
})

// Read-only public data (camps, art, gate, weather, toilets): NetworkFirst so it
// refreshes online and serves the last-synced copy offline. Auth/mutating routes
// are intentionally NOT cached.
registerRoute(
  ({ url, request }) => request.method === 'GET' && /^\/api\/(camps|art|gate|weather|toilets|events)\b/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'burnermap-api',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
)

// MapLibre glyph (font) PBFs are self-hosted under /fonts and precached above,
// so labels render offline with no third-party dependency. This runtime route is
// a belt-and-suspenders fallback for any range not in the precache manifest.
registerRoute(
  ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/fonts/'),
  new CacheFirst({
    cacheName: 'burnermap-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  }),
)

// autoUpdate: take over as soon as the new SW is ready so a refresh serves fresh code.
self.skipWaiting()
clientsClaim()
