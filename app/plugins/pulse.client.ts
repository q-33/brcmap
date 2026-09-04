// Tell the server somebody is here — once a minute at most, and only while the
// tab is actually being looked at.
//
// This runs on a hotspot a whole camp is sharing, so it is one small POST with
// no library behind it, it never blocks a render, and it goes quiet the moment
// the tab is hidden or the browser says it is offline. A failed ping is not
// worth a retry: if nobody heard it, nobody was there to count.
export default defineNuxtPlugin((nuxtApp) => {
  const MIN_GAP_MS = 60_000
  let last = 0

  function ping(path: string) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false)
      return
    if (document.visibilityState !== 'visible')
      return
    const now = Date.now()
    if (now - last < MIN_GAP_MS)
      return
    last = now
    // keepalive so a ping fired as the page unloads still leaves.
    $fetch('/api/pulse', { method: 'POST', body: { path }, keepalive: true }).catch(() => {})
  }

  nuxtApp.hook('app:mounted', () => {
    const router = useRouter()
    ping(router.currentRoute.value.path)
    router.afterEach(to => ping(to.path))
    // A map left open is still someone using the map.
    setInterval(() => ping(router.currentRoute.value.path), 5 * 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible')
        ping(router.currentRoute.value.path)
    })
  })
})
