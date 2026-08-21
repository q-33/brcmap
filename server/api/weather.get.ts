import { ofetch } from 'ofetch'
import { activeStations, isFresh } from '~~/lib/weather/stations'

// Weather for Black Rock City, from three sources that answer different questions.
//
//   OBSERVATIONS  what it is doing right now
//     Local stations first — a burner's Tempest standing in the dust beats a
//     model reading a 9 km grid cell, and it reports gusts, wet-bulb globe
//     temperature and lightning that Open-Meteo simply does not carry.
//     Open-Meteo's `current` is kept as the fallback and as a second opinion.
//
//   FORECAST      what it will do over the next week
//     Open-Meteo's default blend. Unchanged, and still what the page leads with.
//
//   EXTENDED      what it might do beyond that
//     ECMWF, the European model, out to fifteen days. Good for deciding what to
//     pack; not for deciding what to wear.
//
// Every source degrades on its own. A dead station falls back to the model, a
// failed ECMWF call drops the extended strip, and the page keeps working.
interface WeatherDay { date: string, code: number, max: number, min: number, windMax: number, gustMax: number, precip: number, sunrise: string, sunset: string }
interface ExtendedDay { date: string, max: number, min: number, windMax: number, precip: number }

interface StationReading {
  key: string
  label: string
  owner: string
  observedAt: string
  fresh: boolean
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
  wbgtF: number | null
  uv: number | null
  precipTodayIn: number | null
  lightningLast1hr: number | null
  lightningLastDistanceMi: number | null
}

interface WeatherResult {
  current: Record<string, number> | null
  days: WeatherDay[]
  /** local stations, freshest first; empty when none are up */
  stations: StationReading[]
  /** which source the page should lead with */
  primary: 'station' | 'model'
  extended: { model: string, days: ExtendedDay[] } | null
  updatedAt: string
}

const LAT = '40.7833'
const LON = '-119.2079'
const TZ = 'America/Los_Angeles'

async function openMeteo() {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    timezone: TZ,
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_gusts_10m_max,precipitation_probability_max,sunrise,sunset',
    forecast_days: '7',
  })
  return ofetch<any>(`https://api.open-meteo.com/v1/forecast?${params}`, { timeout: 8000, retry: 1 })
}

// The European model, through Open-Meteo's ECMWF endpoint. Separate call on
// purpose: it is the least important of the three, so it is also the one allowed
// to fail without taking anything else with it.
async function ecmwf() {
  const params = new URLSearchParams({
    latitude: LAT,
    longitude: LON,
    timezone: TZ,
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    daily: 'temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_sum',
    forecast_days: '15',
  })
  return ofetch<any>(`https://api.open-meteo.com/v1/ecmwf?${params}`, { timeout: 8000, retry: 1 })
}

async function readStations(): Promise<StationReading[]> {
  if (!tempestConfigured())
    return []
  const out: StationReading[] = []
  for (const s of activeStations()) {
    try {
      const o = await latestObservation(s.stationId)
      if (!o)
        continue
      out.push({
        key: s.key,
        label: s.label,
        owner: s.owner,
        fresh: isFresh(Date.parse(o.observedAt)),
        ...o,
      })
    }
    catch {
      // One dead station must not take the others — or the forecast — down.
    }
  }
  // Freshest first, so the page can simply take the head of the list.
  return out.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))
}

export default defineCachedEventHandler(async (): Promise<WeatherResult> => {
  const [om, stations, ec] = await Promise.all([
    openMeteo(),
    readStations(),
    ecmwf().catch(() => null),
  ])

  const d = om?.daily
  const days: WeatherDay[] = (d?.time ?? []).map((date: string, i: number) => ({
    date,
    code: d.weather_code[i],
    max: d.temperature_2m_max[i],
    min: d.temperature_2m_min[i],
    windMax: d.wind_speed_10m_max[i],
    gustMax: d.wind_gusts_10m_max[i],
    precip: d.precipitation_probability_max[i],
    sunrise: d.sunrise[i],
    sunset: d.sunset[i],
  }))

  const ed = ec?.daily
  const extended = ed?.time?.length
    ? {
        model: 'ECMWF (European Centre)',
        days: (ed.time as string[]).map((date, i) => ({
          date,
          max: ed.temperature_2m_max[i],
          min: ed.temperature_2m_min[i],
          windMax: ed.wind_speed_10m_max[i],
          precip: ed.precipitation_sum[i],
        })),
      }
    : null

  return {
    current: om?.current ?? null,
    days,
    stations,
    primary: stations.some(s => s.fresh) ? 'station' : 'model',
    extended,
    updatedAt: new Date().toISOString(),
  }
  // Five minutes rather than ten: a local station reports about once a minute,
  // and during a dust event a ten-minute-old gust is a different afternoon.
}, { maxAge: 300, name: 'weather', getKey: () => 'brc', swr: true })
