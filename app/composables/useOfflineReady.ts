// "Download for the playa" — proactively warm the offline caches so the app works
// with no signal even without a prior organic visit. The app shell + map code +
// fonts are precached by the service worker on install; this tops that up with the
// home shell and the read-only data the map needs (camps, art, events, gate,
// weather). Everything is fetched through the SW, which caches it per its routes.
const LS_KEY = 'brcmap:lastSyncedAt'

// Read-only public data the map/pages need offline.
const CRITICAL_API = ['/api/camps', '/api/art', '/api/events', '/api/gate', '/api/weather']
// The home shell — offline hard-reloads fall back to it, then client-route.
const CRITICAL_SHELL = ['/']

export function useOfflineReady() {
  const supported = useState('offline-supported', () => false)
  const syncing = useState('offline-syncing', () => false)
  const progress = useState('offline-progress', () => 0) // 0..1
  const lastSyncedAt = useState<number | null>('offline-last-synced', () => null)
  const error = useState<string | null>('offline-error', () => null)

  onMounted(() => {
    supported.value = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    const v = localStorage.getItem(LS_KEY)
    lastSyncedAt.value = v ? Number(v) : null
  })

  async function downloadForPlaya() {
    if (!supported.value || syncing.value)
      return
    syncing.value = true
    error.value = null
    progress.value = 0
    try {
      // Make sure the service worker is installed & controlling before we warm it.
      await navigator.serviceWorker.ready
      const shellReqs = CRITICAL_SHELL.map(url => new Request(url, { headers: { accept: 'text/html' }, cache: 'reload' }))
      const apiReqs = CRITICAL_API.map(url => new Request(url, { cache: 'reload' }))
      const targets = [...shellReqs, ...apiReqs]
      let done = 0
      await Promise.all(targets.map(async (req) => {
        try {
          await fetch(req)
        }
        catch {
          // A single failed endpoint shouldn't fail the whole download.
        }
        finally {
          done++
          progress.value = done / targets.length
        }
      }))
      lastSyncedAt.value = Date.now()
      localStorage.setItem(LS_KEY, String(lastSyncedAt.value))
    }
    catch (e: any) {
      error.value = e?.message ?? 'Download failed'
    }
    finally {
      syncing.value = false
    }
  }

  return { supported, syncing, progress, lastSyncedAt, error, downloadForPlaya }
}
