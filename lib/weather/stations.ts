// Local weather stations burners bring to the playa.
//
// A model reading a 9 km grid cell cannot tell you the gust that just took your
// shade structure. A station standing in the dust can. So when a local station is
// reporting we lead with it, and fall back to Open-Meteo the moment it goes quiet
// — which it will, because these run on solar and get packed up before Exodus.
//
// ADDING A STATION: append an entry. `activeFrom`/`activeTo` bound the dates its
// owner will actually have it running; outside that window it is ignored without
// anyone having to remember to remove it.
export interface LocalStation {
  /** stable slug used in the API payload and the UI */
  key: string
  /** Tempest station id (numeric, from GET /stations) */
  stationId: number
  /** what to call it on the page */
  label: string
  /** who brought it — credit belongs to them */
  owner: string
  /** roughly where it stands, for the distance-from-the-Man readout */
  lat: number
  lng: number
  /** ISO dates, inclusive. Outside this the station is skipped entirely. */
  activeFrom: string
  activeTo: string
  vendor: 'tempest'
}

export const LOCAL_STATIONS: LocalStation[] = [
  {
    key: 'radar',
    // Filled in once the station is registered — see scripts/tempest-stations.mjs,
    // which lists the ids the API key can see.
    stationId: 0,
    label: "Radar's station",
    owner: 'Radar',
    // Placed in the city; refined once it is standing.
    lat: 40.7833,
    lng: -119.2079,
    activeFrom: '2026-08-27',
    activeTo: '2026-09-07',
    vendor: 'tempest',
  },
]

/** Stations whose owner says they are up on the given date (default: today). */
export function activeStations(on: Date = new Date()): LocalStation[] {
  const day = on.toISOString().slice(0, 10)
  return LOCAL_STATIONS.filter(s => s.stationId > 0 && s.activeFrom <= day && day <= s.activeTo)
}

/**
 * How stale an observation may be before we stop leading with it.
 *
 * Tempest reports about once a minute. Fifteen minutes of silence means the
 * station is asleep, buried, or packed — either way the model is now the better
 * answer, and showing an hour-old gust as "current" during a dust event would be
 * worse than showing nothing.
 */
export const STALE_AFTER_MS = 15 * 60 * 1000

export function isFresh(observedAtMs: number, now = Date.now()): boolean {
  return now - observedAtMs < STALE_AFTER_MS
}
