import type { Feature, FeatureCollection } from 'geojson'
import { and, eq } from 'drizzle-orm'
import { art, camps, landmarkOverrides } from '../../db/schema'
import { CITY_YEAR } from '~~/lib/brc/geocode'
import { cityGridGeoJson, civicLandmarksGeoJson, toiletsGeoJson } from '~~/lib/brc/cityGeoJson'

// GeoJSON export of the map, for partner projects that want a BRC Map layer of
// their own (Burning Mesh's Meshtastic app is the first).
//
//   GET /api/export/camps      placed camps, points
//   GET /api/export/art        placed artworks, points
//   GET /api/export/landmarks  medical, Rangers, ice, gate, the Temple…
//   GET /api/export/toilets    the surveyed porta-potty banks
//   GET /api/export/city       streets, blocks, plazas, the trash fence
//   GET /api/export/all        every layer above, tagged with `layer`
//
// Gated behind the `data-export` feature flag (admins always pass), so access is
// granted per person and can be withdrawn without a deploy.
//
// WHAT IS DELIBERATELY NOT HERE: owner names, owner emails, contact addresses,
// account ids. A camp's public listing is its name, where it is, and what it
// says about itself. Everything that identifies a PERSON stays behind our login.
//
// Camps that asked to be left out of third-party exports are filtered here — see
// migration 0020. They stay fully visible on brcmap.net; they are simply not
// handed onward.
const LAYERS = ['camps', 'art', 'landmarks', 'toilets', 'city', 'all'] as const
type Layer = typeof LAYERS[number]

function pointFeature(layer: string, lng: number, lat: number, props: Record<string, unknown>): Feature {
  return { type: 'Feature', properties: { layer, ...props }, geometry: { type: 'Point', coordinates: [lng, lat] } }
}

/** Most recent location carrying real coordinates. */
function placed(locations: { addressString: string | null, gpsLatitude: number | null, gpsLongitude: number | null, createdAt: Date }[]) {
  return locations
    .filter(l => l.gpsLatitude != null && l.gpsLongitude != null)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]
}

export default defineEventHandler(async (event) => {
  await requireFeature(event, 'data-export')

  const layer = getRouterParam(event, 'layer')?.replace(/\.geojson$/, '') as Layer
  if (!LAYERS.includes(layer))
    throw createError({ statusCode: 404, statusMessage: `Unknown layer. Try: ${LAYERS.join(', ')}` })

  const db = useDb()
  const want = (l: Layer) => layer === 'all' || layer === l
  const features: Feature[] = []

  if (want('camps')) {
    const rows = await db.query.camps.findMany({
      where: and(eq(camps.hidden, false), eq(camps.excludeFromExport, false)),
      columns: { id: true, name: true, description: true, website: true, url: true, hometown: true, frontageFt: true, depthFt: true },
      with: { locations: { columns: { addressString: true, gpsLatitude: true, gpsLongitude: true, createdAt: true } } },
      limit: 5000,
    })
    for (const c of rows) {
      const loc = placed(c.locations)
      if (!loc)
        continue
      features.push(pointFeature('camp', loc.gpsLongitude!, loc.gpsLatitude!, {
        id: c.id,
        name: c.name,
        address: loc.addressString ?? '',
        description: c.description ?? '',
        website: c.website || c.url || '',
        hometown: c.hometown ?? '',
        frontage_ft: c.frontageFt ?? null,
        depth_ft: c.depthFt ?? null,
      }))
    }
  }

  if (want('art')) {
    const rows = await db.query.art.findMany({
      where: eq(art.hidden, false),
      columns: { id: true, name: true, artist: true, description: true, website: true, hometown: true },
      with: { locations: { columns: { addressString: true, gpsLatitude: true, gpsLongitude: true, createdAt: true } } },
      limit: 5000,
    })
    for (const a of rows) {
      const loc = placed(a.locations)
      if (!loc)
        continue
      features.push(pointFeature('art', loc.gpsLongitude!, loc.gpsLatitude!, {
        id: a.id,
        name: a.name,
        artist: a.artist ?? '',
        address: loc.addressString ?? '',
        description: a.description ?? '',
        website: a.website ?? '',
        hometown: a.hometown ?? '',
      }))
    }
  }

  if (want('landmarks')) {
    // admin corrections win, same as the map
    let overrides: { name: string, lat: number, lng: number, note: string | null }[] = []
    try {
      overrides = await db.select({
        name: landmarkOverrides.name,
        lat: landmarkOverrides.lat,
        lng: landmarkOverrides.lng,
        note: landmarkOverrides.note,
      }).from(landmarkOverrides)
    }
    catch { /* table missing → ship the shipped constants */ }
    for (const f of civicLandmarksGeoJson(overrides).features)
      features.push({ ...f, properties: { layer: 'landmark', ...f.properties } })
  }

  if (want('toilets')) {
    for (const f of toiletsGeoJson().features)
      features.push({ ...f, properties: { layer: 'toilet', ...f.properties } })
  }

  if (want('city')) {
    for (const f of cityGridGeoJson().features)
      features.push({ ...f, properties: { layer: 'city', ...f.properties } })
  }

  const out: FeatureCollection = {
    type: 'FeatureCollection',
    // Non-standard members are legal in GeoJSON (RFC 7946 §6.1) and give the
    // consumer provenance without a second request.
    ...{
      name: `brcmap-${layer}-${CITY_YEAR}`,
      attribution: 'BRC Map (brcmap.net) — community data, CC BY-SA. City geometry derived from Burning Man\'s surveyed GIS.',
      generated: new Date().toISOString(),
      year: CITY_YEAR,
    },
    features,
  } as FeatureCollection

  setHeader(event, 'content-type', 'application/geo+json; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="brcmap-${layer}-${CITY_YEAR}.geojson"`)
  // Third-party data: never let a shared cache hold it.
  setHeader(event, 'cache-control', 'private, no-store')
  return out
})
