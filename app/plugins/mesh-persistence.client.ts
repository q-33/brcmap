import { get, set } from 'idb-keyval'

// Persist the Meshtastic node store + chat to IndexedDB so they survive reloads
// and show offline — a "where I last saw my people" view even before (or without)
// reconnecting a radio. Client-only; runs once for the app lifetime.
const NODES_KEY = 'bm:mesh:nodes'
const MSGS_KEY = 'bm:mesh:messages'
const MAX_MESSAGES = 500

export default defineNuxtPlugin(() => {
  const { nodes, messages } = useMeshtastic()

  // Hydrate last-known state in the background (don't gate app startup on the
  // IndexedDB read); never clobber a session that already has data.
  void (async () => {
    try {
      const [savedNodes, savedMsgs] = await Promise.all([get(NODES_KEY), get(MSGS_KEY)])
      if (savedNodes && Object.keys(nodes.value).length === 0)
        nodes.value = savedNodes
      if (Array.isArray(savedMsgs) && messages.value.length === 0)
        messages.value = savedMsgs
    }
    catch {
      // No IndexedDB (private mode / old browser) — persistence is best-effort.
    }
  })()

  // JSON round-trip → plain, structured-clonable objects (Vue reactive proxies
  // don't survive IndexedDB's structured clone). Our data is JSON-safe.
  const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v))

  let timer: ReturnType<typeof setTimeout> | undefined
  watch([nodes, messages], () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      set(NODES_KEY, plain(nodes.value)).catch(() => {})
      set(MSGS_KEY, plain(messages.value.slice(-MAX_MESSAGES))).catch(() => {})
    }, 800)
  }, { deep: true })
})
