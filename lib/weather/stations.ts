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
 * How far from Black Rock City a "local" station may be and still count.
 *
 * The date window is not enough on its own. A station is a physical object in
 * somebody's truck: Radar's is in Texas until he drives it out, and if he is
 * delayed a day the calendar would happily start publishing Texas weather as
 * playa conditions. So every observation is checked against where the station
 * says it actually is, and one that is not on the playa is discarded no matter
 * what the date says.
 *
 * 50 km covers the whole Black Rock Desert and Gerlach with room to spare, while
 * rejecting anywhere someone might reasonably keep a station at home.
 */
export const MAX_STATION_KM = 50

const EARTH_KM_PER_DEG = 111.32

/** Flat-earth distance, which is plenty at this scale. */
export function kmFromCity(lat: number, lng: number): number {
  const dy = (lat - CITY.lat) * EARTH_KM_PER_DEG
  const dx = (lng - CITY.lng) * EARTH_KM_PER_DEG * Math.cos((CITY.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

/** Black Rock City, for the distance check. */
export const CITY = { lat: 40.7864, lng: -119.2065 }

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
