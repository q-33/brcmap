import { ofetch } from 'ofetch'

// Tempest (WeatherFlow) REST client — the personal weather stations burners
// bring out. https://apidocs.tempestwx.com
//
//   GET /stations                        stations this key can see
//   GET /observations/station/{id}       latest observation
//
// Auth is an `api_key` query parameter. It is server-only: it reaches every
// station on the owner's account, so it never goes near the browser. Unset until
// someone hands us one, and everything here reports "not configured" rather than
// failing — the weather page keeps working on Open-Meteo alone.
const BASE = 'https://swd.weatherflow.com/swd/rest'

export function tempestConfigured(): boolean {
  return !!(useRuntimeConfig().tempestApiKey as string)
}

/** One reading, already converted to the units the site displays. */
export interface TempestObservation {
  observedAt: string
  tempF: number | null
  feelsLikeF: number | null
  humidity: number | null
  windMph: number | null
  gustMph: number | null
  lullMph: number | null
  windDirDeg: number | null
  pressureInHg: number | null
  pressureTrend: string | null
  dewPointF: number | null
  /** wet-bulb globe temperature — the number heat-safety guidance is written against */
  wbgtF: number | null
  uv: number | null
  solarWm2: number | null
  precipTodayIn: number | null
  lightningLast1hr: number | null
  lightningLastDistanceMi: number | null
}

const cToF = (c: number | null | undefined) => (c == null ? null : Math.round((c * 9 / 5 + 32) * 10) / 10)
const msToMph = (m: number | null | undefined) => (m == null ? null : Math.round(m * 2.236936 * 10) / 10)
const mbToInHg = (mb: number | null | undefined) => (mb == null ? null : Math.round(mb * 0.0295299830714 * 100) / 100)
const mmToIn = (mm: number | null | undefined) => (mm == null ? null : Math.round(mm * 0.0393701 * 100) / 100)
const kmToMi = (km: number | null | undefined) => (km == null ? null : Math.round(km * 0.621371 * 10) / 10)

async function call<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
  const key = useRuntimeConfig().tempestApiKey as string
  if (!key)
    throw createError({ statusCode: 503, statusMessage: 'Tempest API key not configured (set TEMPEST_API_KEY)' })
  return ofetch<T>(`${BASE}${path}`, {
    query: { ...query, api_key: key },
    timeout: 8000,
    retry: 1,
  })
}

/** Stations the key can see — used once, to find the numeric id for the registry. */
export async function listStations(): Promise<{ station_id: number, name: string, public_name?: string, latitude?: number, longitude?: number }[]> {
  const r = await call<{ stations?: any[] }>('/stations')
  return (r.stations ?? []).map(s => ({
    station_id: s.station_id,
    name: s.name,
    public_name: s.public_name,
    latitude: s.latitude,
    longitude: s.longitude,
  }))
}

/**
 * Latest observation for a station, in display units.
 *
 * Tempest reports metric regardless of the account's display preference unless
 * asked otherwise, so everything is converted here rather than trusting whatever
 * the station happens to be set to — a station configured in Celsius must not
 * quietly render 32° as freezing on a 90°F afternoon.
 */
export async function latestObservation(stationId: number): Promise<TempestObservation | null> {
  const r = await call<{ obs?: any[] }>(`/observations/station/${stationId}`, {
    units_temp: 'c',
    units_wind: 'mps',
    units_pressure: 'mb',
    units_precip: 'mm',
    units_distance: 'km',
  })
  const o = r.obs?.[0]
  if (!o || o.timestamp == null)
    return null
  return {
    observedAt: new Date(o.timestamp * 1000).toISOString(),
    tempF: cToF(o.air_temperature),
    feelsLikeF: cToF(o.feels_like),
    humidity: o.relative_humidity ?? null,
    windMph: msToMph(o.wind_avg),
    gustMph: msToMph(o.wind_gust),
    lullMph: msToMph(o.wind_lull),
    windDirDeg: o.wind_direction ?? null,
    pressureInHg: mbToInHg(o.sea_level_pressure ?? o.station_pressure),
    pressureTrend: o.pressure_trend ?? null,
    dewPointF: cToF(o.dew_point),
    wbgtF: cToF(o.wet_bulb_globe_temperature),
    uv: o.uv ?? null,
    solarWm2: o.solar_radiation ?? null,
    precipTodayIn: mmToIn(o.precip_accum_local_day),
    lightningLast1hr: o.lightning_strike_count_last_1hr ?? null,
    lightningLastDistanceMi: kmToMi(o.lightning_strike_last_distance),
  }
}
