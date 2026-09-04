// Curated headline burns (the big effigy/art burns — not camp-submitted). Shared
// by the Events page (the "Major Burns" list) and the app-wide day-of announcement
// banner. `date` is the playa (Pacific) calendar day the burn happens.
export interface MajorBurn {
  name: string
  date: string // 'YYYY-MM-DD' (America/Los_Angeles)
  day: string // list display, e.g. 'Friday, Sep 4'
  time: string // list display, e.g. 'Sunset · 7:30 PM'
  tonight: string // announcement time, reads after "…happens tonight at "
  /** when it actually lights, for the countdown. Pacific, so DST is explicit. */
  at: string
  isMan?: boolean // the Man burn is announced by the countdown banner itself
  expected?: boolean // schedule not yet officially published
}

export const MAJOR_BURNS: MajorBurn[] = [
  { name: 'The Wave', date: '2026-09-02', day: 'Wednesday, Sep 2', time: '11:01 PM', tonight: '11:01 PM', at: '2026-09-02T23:01:00-07:00' },
  { name: 'Titanic\'s End', date: '2026-09-04', day: 'Friday, Sep 4', time: 'Sunset · 7:30 PM', tonight: 'sunset (7:30 PM)', at: '2026-09-04T19:30:00-07:00' },
  { name: 'The Man', date: '2026-09-05', day: 'Saturday, Sep 5', time: 'After dark · ~9 PM', tonight: 'after dark (~9 PM)', at: '2026-09-05T21:00:00-07:00', isMan: true, expected: true },
  { name: 'The Temple', date: '2026-09-06', day: 'Sunday, Sep 6', time: 'At dusk · ~8 PM', tonight: 'dusk (~8 PM)', at: '2026-09-06T20:00:00-07:00', expected: true },
]

/** The playa calendar day ('YYYY-MM-DD', America/Los_Angeles) for an epoch ms. */
export function pacificDateOf(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

/** The major burn happening on the given Pacific date, or null. */
export function burnOn(pacificDate: string): MajorBurn | null {
  return MAJOR_BURNS.find(b => b.date === pacificDate) ?? null
}

/**
 * The next headline burn on or after a Pacific date — today's if one is
 * happening today, otherwise the soonest still to come.
 *
 * Returns null once the last burn of the year has passed rather than wrapping
 * around to next year's, which would have the map cheerfully announcing a burn
 * eleven months out.
 */
export function nextBurn(pacificDate: string): MajorBurn | null {
  return MAJOR_BURNS.find(b => b.date >= pacificDate) ?? null
}

/** Is this burn happening on the given Pacific date? */
export function burnsToday(b: MajorBurn, pacificDate: string): boolean {
  return b.date === pacificDate
}

/** How long a burn stays "burning now" before the countdown gives up on it. */
const BURNING_FOR_MS = 90 * 60 * 1000

export type BurnPhase = 'upcoming' | 'burning' | 'over'

/**
 * Where a burn sits relative to now: still coming, alight, or done.
 *
 * `label` is written for someone standing in the dust deciding whether they
 * have time to ride out there — so it counts in days, then hours and minutes,
 * and never in seconds, which would only make a static thing look frantic.
 *
 * Times for burns marked `expected` are Burning Man's stated intent, not a
 * published schedule; the caller is expected to say so rather than implying a
 * precision nobody has.
 */
export function burnCountdown(b: MajorBurn, nowMs: number): { phase: BurnPhase, ms: number, label: string } {
  const ms = Date.parse(b.at) - nowMs
  if (ms <= -BURNING_FOR_MS)
    return { phase: 'over', ms, label: 'burned' }
  if (ms <= 0)
    return { phase: 'burning', ms, label: 'burning now' }

  const mins = Math.floor(ms / 60_000)
  if (mins < 60)
    return { phase: 'upcoming', ms, label: `in ${mins}m` }
  const hours = Math.floor(mins / 60)
  if (hours < 24)
    return { phase: 'upcoming', ms, label: `in ${hours}h ${mins % 60}m` }
  const days = Math.round(hours / 24)
  return { phase: 'upcoming', ms, label: `in ${days} day${days === 1 ? '' : 's'}` }
}

/** The next burn that has not finished yet — what the map should be counting to. */
export function upcomingBurn(nowMs: number): MajorBurn | null {
  return MAJOR_BURNS.find(b => burnCountdown(b, nowMs).phase !== 'over') ?? null
}

export type BurnUrgency = 'far' | 'near' | 'imminent' | 'burning' | 'over'

/**
 * How loudly the map should be talking about a burn.
 *
 * The Man escalates earlier and for longer than the rest, because it is the
 * night the city is here for: it reads `near` from half a day out and
 * `imminent` for the last three hours, where an ordinary burn gets eight hours
 * and one. It deliberately does NOT get a banner of its own back — a stack of
 * full-width bands over the city is what this replaced — so the extra weight
 * has to be carried by the one line that is already there.
 */
export function burnUrgency(b: MajorBurn, nowMs: number): BurnUrgency {
  const { phase, ms } = burnCountdown(b, nowMs)
  if (phase !== 'upcoming')
    return phase === 'burning' ? 'burning' : 'over'
  const hours = ms / 3600_000
  const [nearAt, imminentAt] = b.isMan ? [12, 3] : [8, 1]
  if (hours <= imminentAt)
    return 'imminent'
  if (hours <= nearAt)
    return 'near'
  return 'far'
}
