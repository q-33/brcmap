import { ofetch } from 'ofetch'
import type { AirNow, FireAlert, FireIncident } from '../../lib/fires'
import { BRC, bearingBetween, byThreat, isFireRelated, kmBetween } from '../../lib/fires'

// Wildfire, smoke and official-alert status around Black Rock City.
//
// Three official feeds, none needing a key:
//   NWS       api.weather.gov       watches/warnings, incl. Red Flag and smoke
//   NIFC      WFIGS current incidents   active fires, size, containment
//   Open-Meteo air-quality           PM2.5 and US AQI (same provider as weather)
//
// We report; we never decide. Evacuation orders belong to county emergency
// managers, so nothing here infers one — the page links out to them. Cached 10
// minutes: fires move, but these feeds do not update faster than that and we
// should not hammer them.

const NWS_UA = 'brcmap.net (digit@brcmap.net)'
const NIFC = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query'
const AQ = 'https://air-quality-api.open-meteo.com/v1/air-quality'

/** how far out we care about a fire */
const RADIUS_KM = 300
const MAX_INCIDENTS = 6

async function nwsAlerts(): Promise<FireAlert[]> {
  const map = (f: any): FireAlert => ({
    event: f.properties?.event ?? 'Alert',
    severity: f.properties?.severity ?? null,
    urgency: f.properties?.urgency ?? null,
    headline: f.properties?.headline ?? null,
    area: f.properties?.areaDesc ?? null,
    ends: f.properties?.ends ?? f.properties?.expires ?? null,
    url: f.id ?? null,
  })
  const headers = { 'User-Agent': NWS_UA, 'Accept': 'application/geo+json' }
  const [atBrc, statewide] = await Promise.all([
    ofetch<any>(`https://api.weather.gov/alerts/active?point=${BRC.lat},${BRC.lng}`, { headers, timeout: 12_000 })
      .catch(() => ({ features: [] })),
    ofetch<any>('https://api.weather.gov/alerts/active?area=NV', { headers, timeout: 12_000 })
      .catch(() => ({ features: [] })),
  ])
  // Everything in force AT the city matters. Statewide, only the fire and smoke
  // ones belong in this section — the rest is the weather card's business.
  const here = (atBrc.features ?? []).map(map)
  const seen = new Set(here.map((a: FireAlert) => a.url))
  const regional = (statewide.features ?? []).map(map)
    .filter((a: FireAlert) => isFireRelated(a.event) && !seen.has(a.url))
  return [...here, ...regional]
}

async function nifcIncidents(): Promise<FireIncident[]> {
  const d = Math.round((RADIUS_KM / 111.32) * 1.2) // generous bbox, filtered by real distance below
  const res = await ofetch<any>(NIFC, {
    query: {
      where: 'ActiveFireCandidate=1',
      geometry: `${BRC.lng - d},${BRC.lat - d},${BRC.lng + d},${BRC.lat + d}`,
      geometryType: 'esriGeometryEnvelope',
      inSR: 4326,
      outSR: 4326,
      spatialRel: 'esriSpatialRelIntersects',
      outFields: [
        'IncidentName', 'IncidentSize', 'PercentContained', 'POOCounty',
        'POOState', 'FireDiscoveryDateTime', 'FireCause',
      ].join(','),
      returnGeometry: true,
      f: 'json',
    },
    timeout: 20_000,
  })
  const out: FireIncident[] = []
  for (const f of res?.features ?? []) {
    const a = f.attributes ?? {}
    const g = f.geometry ?? {}
    if (typeof g.y !== 'number' || typeof g.x !== 'number')
      continue
    const at = { lat: g.y, lng: g.x }
    const km = kmBetween(BRC, at)
    if (km > RADIUS_KM)
      continue
    out.push({
      name: String(a.IncidentName ?? 'Unnamed fire').trim(),
      km,
      bearing: bearingBetween(BRC, at),
      acres: typeof a.IncidentSize === 'number' ? a.IncidentSize : null,
      contained: typeof a.PercentContained === 'number' ? a.PercentContained : null,
      county: a.POOCounty ?? null,
      state: a.POOState ? String(a.POOState).replace(/^US-/, '') : null,
      discovered: typeof a.FireDiscoveryDateTime === 'number' ? a.FireDiscoveryDateTime : null,
      cause: a.FireCause ?? null,
    })
  }
  return out.sort(byThreat).slice(0, MAX_INCIDENTS)
}

async function airQuality(): Promise<AirNow> {
  const d = await ofetch<any>(AQ, {
    query: {
      latitude: BRC.lat,
      longitude: BRC.lng,
      current: 'pm2_5,us_aqi',
      hourly: 'us_aqi',
      forecast_days: 2,
      timezone: 'America/Los_Angeles',
    },
    timeout: 12_000,
  })
  const next = (d?.hourly?.us_aqi ?? []).slice(0, 24).filter((x: any) => typeof x === 'number')
  return {
    usAqi: d?.current?.us_aqi ?? null,
    pm25: d?.current?.pm2_5 ?? null,
    aqiNext24: next.length ? Math.max(...next) : null,
  }
}

export default defineCachedEventHandler(async () => {
  // One bad feed must not blank the whole section — a fire list still helps when
  // air quality is down, and vice versa.
  const [alerts, incidents, air] = await Promise.all([
    nwsAlerts().catch(() => [] as FireAlert[]),
    nifcIncidents().catch(() => [] as FireIncident[]),
    airQuality().catch(() => ({ usAqi: null, pm25: null, aqiNext24: null } as AirNow)),
  ])
  return { alerts, incidents, air, updatedAt: new Date().toISOString() }
}, { maxAge: 600, swr: true, name: 'fires', getKey: () => 'brc' })
