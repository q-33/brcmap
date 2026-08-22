/**
 * Re-fetch on a timer while the tab is actually being looked at.
 *
 * The Live page carries fire alerts, air quality and wind. Someone checks it,
 * puts the phone in a pocket, and looks again an hour later — without this they
 * are reading an hour-old Red Flag Warning as though it were current.
 *
 * Two rules, both because of where this gets used:
 *
 *   Only while visible. On playa every request costs battery and a slice of a
 *   very thin data connection. A backgrounded tab polling all afternoon is a
 *   real cost for nobody's benefit.
 *
 *   Catch up on return. Coming back to a hidden tab refreshes immediately if the
 *   data is older than the interval, so the first thing you see is current
 *   rather than whatever was on screen when you looked away.
 */
export function useAutoRefresh(fn: () => unknown | Promise<unknown>, intervalMs: number) {
  const lastAt = ref<number>(Date.now())
  const busy = ref(false)

  async function run() {
    if (busy.value)
      return
    busy.value = true
    try {
      await fn()
      lastAt.value = Date.now()
    }
    catch {
      // A failed poll is not worth a message: the previous reading is still on
      // screen with its own timestamp, and the next tick will try again.
    }
    finally {
      busy.value = false
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null

  function start() {
    stop()
    timer = setInterval(() => {
      if (document.visibilityState === 'visible')
        run()
    }, intervalMs)
  }
  function stop() {
    if (timer)
      clearInterval(timer)
    timer = null
  }

  function onVisible() {
    if (document.visibilityState !== 'visible')
      return
    if (Date.now() - lastAt.value >= intervalMs)
      run()
  }

  onMounted(() => {
    start()
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisible)
  })

  return { lastAt, busy, refreshNow: run }
}

/** "just now" / "4 min ago" — for showing how current a reading is. */
export function agoText(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000)
  if (mins < 1)
    return 'just now'
  if (mins === 1)
    return '1 min ago'
  if (mins < 60)
    return `${mins} min ago`
  const h = Math.round(mins / 60)
  return h === 1 ? '1 hour ago' : `${h} hours ago`
}
