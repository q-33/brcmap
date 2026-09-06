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
