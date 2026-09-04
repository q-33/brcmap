// Curated headline burns (the big effigy/art burns — not camp-submitted). Shared
// by the Events page (the "Major Burns" list) and the app-wide day-of announcement
// banner. `date` is the playa (Pacific) calendar day the burn happens.
export interface MajorBurn {
  name: string
  date: string // 'YYYY-MM-DD' (America/Los_Angeles)
  day: string // list display, e.g. 'Friday, Sep 4'
  time: string // list display, e.g. 'Sunset · 7:30 PM'
  tonight: string // announcement time, reads after "…happens tonight at "
  isMan?: boolean // the Man burn is announced by the countdown banner itself
  expected?: boolean // schedule not yet officially published
}

export const MAJOR_BURNS: MajorBurn[] = [
  { name: 'The Wave', date: '2026-09-02', day: 'Wednesday, Sep 2', time: '11:01 PM', tonight: '11:01 PM' },
  { name: 'Titanic\'s End', date: '2026-09-04', day: 'Friday, Sep 4', time: 'Sunset · 7:30 PM', tonight: 'sunset (7:30 PM)' },
  { name: 'The Man', date: '2026-09-05', day: 'Saturday, Sep 5', time: 'After dark · ~9 PM', tonight: 'after dark (~9 PM)', isMan: true, expected: true },
  { name: 'The Temple', date: '2026-09-06', day: 'Sunday, Sep 6', time: 'At dusk · ~8 PM', tonight: 'dusk (~8 PM)', expected: true },
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
