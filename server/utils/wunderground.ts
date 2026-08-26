import { ofetch } from 'ofetch'

// Weather Underground personal weather stations.
//
//   GET /v2/pws/observations/current?stationId=…&format=json&units=e&apiKey=…
//
// WU is where most burners' stations already publish, so it is the cheapest way
// to put real playa readings on the map: someone gives us a call sign and it
// works. Free API keys come with a PWS account.
//
// `units=e` asks for imperial directly — unlike Tempest, which returns metric
// whatever the account is set to. Trusting the vendor's own conversion here is
// safe because the unit is in the request, not in somebody's display settings.
//
// Server-only, and unset until someone hands us a key: everything reports "not
// configured" rather than failing, and the weather page keeps working without it.
const BASE = 'https://api.weather.com/v2/pws'

export function wuConfigured(): boolean {
  return !!(useRuntimeConfig().wuApiKey as string)
}

/** One reading, in the units the site displays. Mirrors TempestObservation. */
export interface WuObservation {
  observedAt: string
  lat: number | null
  lng: number | null
  /** WU's own name for the station, e.g. "Black Rock City Center" */
  neighborhood: string | null
  tempF: number | null
  feelsLikeF: number | null
  humidity: number | null
  windMph: number | null
  gustMph: number | null
  windDirDeg: number | null
  pressureInHg: number | null
  dewPointF: number | null
  uv: number | null
  solarWm2: number | null
  precipTodayIn: number | null
  precipRateInHr: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

async function call<T>(path: string, query: Record<string, string>): Promise<T> {
  const key = useRuntimeConfig().wuApiKey as string
  if (!key)
    throw createError({ statusCode: 503, statusMessage: 'Weather Underground key not configured (set WU_API_KEY)' })
  return ofetch<T>(`${BASE}${path}`, {
    query: { ...query, format: 'json', units: 'e', apiKey: key },
    timeout: 8000,
    retry: 1,
  })
}

/**
 * Latest observation for a WU station id (a call sign like KNVGERLA2).
 *
 * Returns null when the station exists but has not reported — a station that is
 * registered and silent is a normal state out there, not an error.
 */
export async function wuLatest(stationId: string): Promise<WuObservation | null> {
  const r = await call<{ observations?: any[] }>('/observations/current', { stationId })
  const o = r.observations?.[0]
  if (!o)
    return null
  // Imperial values live in an `imperial` sub-object; the rest is at the top.
  const i = o.imperial ?? {}
  return {
    observedAt: o.obsTimeUtc ?? new Date().toISOString(),
    lat: num(o.lat),
    lng: num(o.lon),
    neighborhood: o.neighborhood ?? null,
    tempF: num(i.temp),
    feelsLikeF: num(i.heatIndex) ?? num(i.windChill) ?? num(i.temp),
    humidity: num(o.humidity),
    windMph: num(i.windSpeed),
    gustMph: num(i.windGust),
    windDirDeg: num(o.winddir),
    pressureInHg: num(i.pressure),
    dewPointF: num(i.dewpt),
    uv: num(o.uv),
    solarWm2: num(o.solarRadiation),
    precipTodayIn: num(i.precipTotal),
    precipRateInHr: num(i.precipRate),
  }
}

/**
 * Check a station id without storing anything — used by the admin panel so a
 * typo is caught while the person is still looking at the form, rather than
 * becoming a silently dead station on the map.
 */
export async function wuProbe(stationId: string): Promise<
  { ok: true, obs: WuObservation } | { ok: false, reason: string }
> {
  try {
    const obs = await wuLatest(stationId)
    if (!obs)
      return { ok: false, reason: 'That station exists but has never reported.' }
    if (obs.lat == null || obs.lng == null)
      return { ok: false, reason: 'That station reports no position, so we cannot tell whether it is on the playa.' }
    return { ok: true, obs }
  }
  catch (e: any) {
    const code = e?.status ?? e?.statusCode
    if (code === 204 || code === 404)
      return { ok: false, reason: 'No station with that ID.' }
    if (code === 401)
      return { ok: false, reason: 'Our Weather Underground key was rejected.' }
    return { ok: false, reason: e?.data?.errors?.[0]?.error?.message ?? 'Weather Underground did not answer.' }
  }
}
