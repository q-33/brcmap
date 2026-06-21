// The Man burns Saturday Sept 5, 2026, ~9 PM Pacific (the Saturday before Labor Day).
const BURN_MS = Date.parse('2026-09-05T21:00:00-07:00')

export function useManCountdown() {
  // null during SSR so there's no hydration mismatch; filled in on the client.
  const now = ref<number | null>(null)
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    now.value = Date.now()
    timer = setInterval(() => (now.value = Date.now()), 60_000)
  })
  onBeforeUnmount(() => timer && clearInterval(timer))

  const days = computed(() => (now.value == null ? null : Math.ceil((BURN_MS - now.value) / 86_400_000)))

  const label = computed(() => {
    const d = days.value
    if (d == null)
      return null
    if (d > 1)
      return `The Man burns in ${d} days`
    if (d === 1)
      return 'The Man burns tomorrow!'
    if (d === 0)
      return 'The Man burns tonight!'
    return 'See you next year on the playa'
  })

  return { days, label }
}
