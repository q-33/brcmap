// Exodus wait math. The number on the page is a claim about how long strangers
// will sit in a hot line with kids and dogs — computed conservatively, shown
// with its evidence (how many reports, how fresh), never invented.

export interface WaitReport { minutes: number, at: number }

/** Median of recent reports — robust to one optimist and one doomsayer. */
export function medianWait(reports: WaitReport[]): number | null {
  if (!reports.length)
    return null
  const s = reports.map(r => r.minutes).sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : Math.round((s[mid - 1]! + s[mid]!) / 2)
}

/** "45 min" / "2 h" / "3½ h" — precision no better than the line deserves. */
export function fmtWait(minutes: number): string {
  if (minutes < 60)
    return `${Math.round(minutes / 5) * 5} min`
  const h = Math.floor(minutes / 60)
  const rem = minutes % 60
  if (rem < 15)
    return `${h} h`
  if (rem < 45)
    return `${h}½ h`
  return `${h + 1} h`
}

/** Reports young enough to describe the line as it is NOW. */
export function freshReports(reports: WaitReport[], nowMs: number, windowMs = 2 * 3600_000): WaitReport[] {
  return reports.filter(r => nowMs - r.at <= windowMs)
}

/** The one-tap choices. Coarse on purpose: nobody in that line knows it to the minute. */
export const WAIT_CHOICES: { minutes: number, label: string }[] = [
  { minutes: 15, label: 'moving — under ½ h' },
  { minutes: 45, label: '~45 min' },
  { minutes: 90, label: '~1½ h' },
  { minutes: 150, label: '~2½ h' },
  { minutes: 240, label: '~4 h' },
  { minutes: 360, label: '~6 h' },
  { minutes: 480, label: '8 h or worse' },
]

// --- Gate Road Level of Service --------------------------------------------
//
// Traffic engineering grades a corridor by measured travel time against its
// free-flow time, A (free flow) to F (breakdown). Gate Road's free-flow run —
// Greeters to pavement, ~8 miles of washboard at 10 mph pulses — is about 45
// minutes, and the org's own history says exodus peaks at 6-9 hours. The bands
// below follow that span.
//
// An engineer's grade is only as good as its detector data, so `live` is part
// of the answer: a grade computed from stale reports is withheld, not dimmed.

export type LosGrade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface GateLos {
  grade: LosGrade
  color: string
  label: string
  /** detector data is fresh — the map may pulse; stale means say nothing */
  live: boolean
}

const LOS_BANDS: { max: number, grade: LosGrade, color: string, label: string }[] = [
  { max: 45, grade: 'A', color: '#16a34a', label: 'free flow' },
  { max: 90, grade: 'B', color: '#65a30d', label: 'moving well' },
  { max: 150, grade: 'C', color: '#ca8a04', label: 'slow and steady' },
  { max: 270, grade: 'D', color: '#d97706', label: 'heavy' },
  { max: 390, grade: 'E', color: '#ea580c', label: 'severe' },
  { max: Infinity, grade: 'F', color: '#dc2626', label: 'gridlock' },
]

/** Detector freshness: reports older than this cannot describe the road NOW. */
export const LOS_FRESH_MS = 2 * 3600_000

/**
 * The corridor's grade from the crowd detector, or null when there is no
 * honest grade to give (no reports, or all of them stale).
 */
export function gateLos(medianMinutes: number | null, newestAtMs: number | null, nowMs: number): GateLos | null {
  if (medianMinutes == null || newestAtMs == null)
    return null
  if (nowMs - newestAtMs > LOS_FRESH_MS)
    return null
  const band = LOS_BANDS.find(b => medianMinutes <= b.max)!
  return { grade: band.grade, color: band.color, label: band.label, live: true }
}
