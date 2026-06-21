// Shared Gate Road condition vocabulary — used by the API, the map, and the UI.
export type GateStatus = 'open' | 'light' | 'moderate' | 'heavy' | 'hold' | 'closed'
export type GateDirection = 'inbound' | 'exodus'

export const GATE_STATUSES: GateStatus[] = ['open', 'light', 'moderate', 'heavy', 'hold', 'closed']

export const GATE_STATUS_META: Record<GateStatus, { label: string, color: string, desc: string }> = {
  open: { label: 'Open', color: '#16a34a', desc: 'Flowing freely' },
  light: { label: 'Light', color: '#65a30d', desc: 'Minor delays' },
  moderate: { label: 'Moderate', color: '#d97706', desc: 'Expect a wait' },
  heavy: { label: 'Heavy', color: '#ea580c', desc: 'Long delays' },
  hold: { label: 'Hold', color: '#dc2626', desc: 'Traffic temporarily stopped' },
  closed: { label: 'Closed', color: '#991b1b', desc: 'Road closed' },
}

export const GATE_DIRECTIONS: { key: GateDirection, label: string, short: string }[] = [
  { key: 'inbound', label: 'Inbound — arrival', short: 'Inbound' },
  { key: 'exodus', label: 'Exodus — departure', short: 'Exodus' },
]

export function gateColor(status: GateStatus | null | undefined): string {
  return status ? GATE_STATUS_META[status].color : '#1c2733'
}
