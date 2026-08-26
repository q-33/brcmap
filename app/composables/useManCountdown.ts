// The Man burns Saturday Sept 5, 2026, ~9 PM Pacific (the Saturday before Labor Day).
const BURN_MS = Date.parse('2026-09-05T21:00:00-07:00')
const BURN_DAY = '2026-09-05'
const PLAYA_TZ = 'America/Los_Angeles'

/**
 * Whole days between two calendar dates, counted on the playa's calendar.
 *
 * NOT elapsed time. "Burns in 10 days" is a statement about dates, not about
 * hours: on the morning of the 26th the burn is 10 days and 10 hours away, and
 * the answer people want — and that Burning Man's own dashboard gives — is 10,
 * not 11. Rounding elapsed milliseconds up turned every part-day into a whole
 * extra day and put us permanently one ahead.
 *
 * Both dates are resolved in Pacific first, so someone reading this from London
 * at 4am sees the same number as someone standing in Gerlach.
 */
function daysBetweenPlayaDates(fromMs: number, toDay: string): number {
  // en-CA gives YYYY-MM-DD, which sorts and parses cleanly.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: PLAYA_TZ }).format(new Date(fromMs))
  const a = Date.parse(`${today}T00:00:00Z`)
  const b = Date.parse(`${toDay}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

export function useManCountdown() {
  // null during SSR so there's no hydration mismatch; filled in on the client.
  const now = ref<number | null>(null)
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    now.value = Date.now()
    timer = setInterval(() => (now.value = Date.now()), 60_000)
  })
  onBeforeUnmount(() => timer && clearInterval(timer))

  const days = computed(() => (now.value == null ? null : daysBetweenPlayaDates(now.value, BURN_DAY)))

  const label = computed(() => {
    const d = days.value
    if (d == null || now.value == null)
      return null
    // The date arithmetic says 0 all day Saturday, including after he has gone
    // up — so the actual burn moment is what ends the countdown, not midnight.
    if (now.value > BURN_MS)
      return 'See you next year on the playa'
    if (d > 1)
      return `The Man burns in ${d} days`
    if (d === 1)
      return 'The Man burns tomorrow!'
    return 'The Man burns tonight!'
  })

  return { days, label }
}
