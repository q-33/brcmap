// Where an event came from, and how its toggle behaves.
//
// The playa runs on guides — QueerBurners, the kink lists, Rock Star Librarian's
// spreadsheet — and each one is hundreds of events. Dropping them all into one
// list would bury the handful a camp posted itself, so every event carries a
// `source` and the Events page lets you switch each guide on or off.
//
// ADDING A GUIDE: append an entry here, import with `source` set to its key, and
// the toggle appears on its own. No component changes. Keep `user` first — it is
// the one people post to themselves.
export interface EventSource {
  key: string
  label: string
  emoji: string
  /** one line, shown under the label when the toggle is on */
  blurb: string
  /** shown before any events exist, in place of the count */
  comingSoon?: boolean
  /** on unless the reader says otherwise */
  defaultOn: boolean
  /** adult content: badged, and never on by default */
  nsfw?: boolean
  /** tailwind colour stem for the pill, e.g. 'violet' */
  tone: string
  /** the guide's own PDF, offered beside the blurb once the toggle is on */
  pdf?: { href: string, label: string, size: string }
}

export const EVENT_SOURCES: EventSource[] = [
  {
    key: 'user',
    label: 'User-Added Events',
    emoji: '📍',
    blurb: 'Posted by camps and burners on BRC Map.',
    defaultOn: true,
    tone: 'primary',
  },
  {
    key: 'official',
    label: 'Official Burning Man',
    emoji: '🔥',
    blurb: "Every event in Burning Man's own directory. Thousands of them.",
    defaultOn: false,
    tone: 'orange',
  },
  {
    key: 'queer',
    label: 'Queer Events',
    emoji: '🏳️‍🌈',
    blurb: 'From the QueerBurners Event Guide 2026.',
    defaultOn: false,
    tone: 'pink',
    pdf: { href: '/guides/queerburners-2026.pdf', label: 'Download the PDF', size: '22 MB' },
  },
  {
    key: 'kink',
    label: 'Kink / Sensual',
    emoji: '🖤',
    blurb: "From the Burning Man Kinky Database. Adult play, workshops and parties. 18+.",
    defaultOn: false,
    nsfw: true,
    tone: 'rose',
  },
  {
    key: 'librarian',
    label: 'Rock Star Librarian',
    emoji: '📚',
    blurb: "Who's playing where, all week, from the Rock Star Librarian music guide.",
    defaultOn: false,
    tone: 'amber',
    pdf: { href: '/guides/rock-star-librarian-2026.pdf', label: 'Download the PDF', size: '2.4 MB' },
  },
]

export const EVENT_SOURCE_KEYS = EVENT_SOURCES.map(s => s.key)
export const DEFAULT_ON = EVENT_SOURCES.filter(s => s.defaultOn).map(s => s.key)

export function isEventSource(k: string): boolean {
  return EVENT_SOURCE_KEYS.includes(k)
}

export function eventSource(k: string | null | undefined): EventSource | undefined {
  return EVENT_SOURCES.find(s => s.key === (k || 'user'))
}
