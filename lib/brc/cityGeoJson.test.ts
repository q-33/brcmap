import { describe, expect, it } from 'vitest'
import { CIVIC_LANDMARKS, cityGridGeoJson, civicLandmarksGeoJson, getManPoint, washCorners } from './cityGeoJson'
import { STREET_RADII } from './geocode'
import { CENTER_CAMP_INK, PLAN_CENTER_CAMP, PLAN_RING_RADII } from './planCenterCamp'
import { GIS_BLOCKS, GIS_FENCE, GIS_PLAZAS, GIS_RING_RADII, GIS_STREETS } from './planCity'

describe('cityGridGeoJson', () => {
  const fc = cityGridGeoJson()

  it('produces blocks, street-name labels, and the portal circles', () => {
    const blocks = fc.features.filter(f => f.properties?.kind === 'block')
    const labels = fc.features.filter(f => f.properties?.kind === 'street-label')
    const portals = fc.features.filter(f => f.properties?.kind === 'portal')
    expect(blocks.length).toBeGreaterThan(200) // 11 ring bands × ~31 columns
    expect(labels.length).toBe(12) // Esplanade + A..K
    // Man + 12:00 + the 12 surveyed plazas. The GIS carries two the parametric
    // city never drew (2:00 & B, 10:00 & B) plus Center Camp Plaza; Center Camp's
    // café and V walkway are ink, not portals — they come from CENTER_CAMP_INK.
    expect(portals.length).toBe(14)
    // no fill masks anymore — the wash raster shows through every circle
    expect(fc.features.filter(f => f.properties?.kind === 'portal-fill').length).toBe(0)
    expect(labels.find(l => l.properties?.name === 'Eternal')).toBeTruthy()
  })

  it('draws the gate ink, walk-in boundary, time labels, and cut channels', () => {
    const gateInk = fc.features.filter(f => f.properties?.kind === 'gate-ink')
    const walkin = fc.features.filter(f => f.properties?.kind === 'walkin-boundary')
    const channels = fc.features.filter(f => f.properties?.kind === 'street-channel')
    const times = fc.features.filter(f => f.properties?.kind === 'time-label')
    expect(gateInk.length).toBeGreaterThan(60) // verbatim official stroke shapes
    expect(walkin.length).toBe(3) // solid 2:00 radial + city-edge arc + SE corner run
    expect(walkin.filter(f => f.properties?.solid === 1).length).toBe(1)
    // 13 ring pieces + 33 radials + keyhole splits + promenades, further split
    // where they are cut at plaza/Man/Center-Camp circles
    expect(channels.length).toBeGreaterThan(70)
    expect(times.length).toBe(33) // 2:00…10:00 every quarter hour
  })

  it('contains no NaN coordinates', () => {
    const polys = fc.features.filter(f => f.geometry.type === 'Polygon')
    const coords = polys.flatMap(f => (f.geometry as any).coordinates[0] as [number, number][])
    expect(coords.length).toBeGreaterThan(0)
    expect(coords.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b))).toBe(true)
  })

  it('provides four finite wash corners in TL,TR,BR,BL order', () => {
    const corners = washCorners()
    expect(corners.length).toBe(4)
    for (const [lng, lat] of corners) {
      expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true)
    }
    // TL is north-west of BR in rotated plan space: TL lat > BR lat
    expect(corners[0]![1]).toBeGreaterThan(corners[2]![1])
  })

  it('centers on the official 2026 golden spike', () => {
    const man = getManPoint()
    expect(man[0]).toBeCloseTo(-119.207871, 3)
    expect(man[1]).toBeCloseTo(40.783242, 3)
  })
})

// The traced ink and the geocoder are two independent descriptions of the same
// city: the plan PDF's vectors, and the BRC Measurements doc. They must not be
// allowed to drift apart — if they ever do, camps geocode to addresses that sit
// off the drawn streets, which is exactly the failure this guards.
describe('traced plan geometry agrees with the geocoder', () => {
  it('measures every ring within a metre of STREET_RADII', () => {
    const names = Object.keys(PLAN_RING_RADII)
    expect(names.length).toBe(Object.keys(STREET_RADII).length)
    for (const name of names) {
      const doc = STREET_RADII[name]
      expect(doc, `${name} missing from STREET_RADII`).toBeDefined()
      expect(Math.abs(PLAN_RING_RADII[name]! - doc!), `${name} drifted`).toBeLessThan(1)
    }
  })

  it('puts Center Camp on the 6:00 axis where the plan draws it', () => {
    // measured off the plan's vectors; the parametric CANOPY_M is 915
    expect(PLAN_CENTER_CAMP.centreM).toBeGreaterThan(900)
    expect(PLAN_CENTER_CAMP.centreM).toBeLessThan(930)
  })

  it('emits closed Center Camp ink rings with finite plan-metre coords', () => {
    expect(CENTER_CAMP_INK.length).toBeGreaterThan(20)
    for (const ring of CENTER_CAMP_INK) {
      expect(ring.length).toBeGreaterThanOrEqual(4)
      expect(ring[0]).toEqual(ring[ring.length - 1]) // closed outline
      for (const [e, n] of ring) {
        expect(Number.isFinite(e) && Number.isFinite(n)).toBe(true)
        // every ring belongs to Center Camp, not the wider city
        expect(Math.hypot(e!, n! + PLAN_CENTER_CAMP.centreM)).toBeLessThan(320)
      }
    }
  })

  it('renders the traced ink as cc-ink polygons', () => {
    const ink = cityGridGeoJson().features.filter(f => f.properties?.kind === 'cc-ink')
    expect(ink.length).toBe(CENTER_CAMP_INK.length)
    expect(ink.every(f => f.geometry.type === 'Polygon')).toBe(true)
  })
})

// The drawn city now comes from Burning Man's surveyed GIS while addresses still
// come from STREET_RADII. Those are two independent descriptions of one city, so
// they must be held together — if they drift, camps geocode to addresses that sit
// off the drawn streets.
describe('official GIS agrees with the geocoder', () => {
  it('measures every ring within 2 m of STREET_RADII', () => {
    const names = Object.keys(GIS_RING_RADII)
    expect(names.length).toBe(Object.keys(STREET_RADII).length)
    for (const name of names) {
      const doc = STREET_RADII[name]
      expect(doc, `${name} missing from STREET_RADII`).toBeDefined()
      expect(Math.abs(GIS_RING_RADII[name]! - doc!), `${name} drifted`).toBeLessThan(2)
    }
  })

  it('carries the surveyed blocks, streets, plazas and fence', () => {
    expect(GIS_BLOCKS.length).toBeGreaterThan(200)
    expect(GIS_STREETS.length).toBeGreaterThan(400)
    expect(GIS_PLAZAS.length).toBe(12)
    expect(GIS_FENCE.length).toBeGreaterThanOrEqual(5)
    // real surveyed roadway widths, in feet
    expect(new Set(GIS_STREETS.map(s => s.w))).toEqual(new Set([20, 30, 40, 50]))
    // Center Camp's own roads are excluded — that area is drawn from traced ink
    expect(GIS_STREETS.some(s => s.s === 'center_camp')).toBe(false)
  })

  it('only lets circular plazas cut the streets', () => {
    const round = GIS_PLAZAS.filter(p => p.round)
    const rect = GIS_PLAZAS.filter(p => !p.round)
    expect(round.length).toBe(10)
    // the 2:00 and 10:00 & B plazas are rectangular keyholes
    expect(rect.map(p => p.n).sort()).toEqual(['10:00 & B Plaza', '2:00 & B Plaza'])
    for (const p of round)
      expect(p.r).toBeGreaterThan(20)
  })

  it('draws blocks and streets from the surveyed data', () => {
    const fc = cityGridGeoJson()
    const blocks = fc.features.filter(f => f.properties?.kind === 'block')
    expect(blocks.length).toBe(GIS_BLOCKS.length)
    const channels = fc.features.filter(f => f.properties?.kind === 'street-channel')
    // Cutting at the drawn circles can split a street or swallow one whole: the
    // 6:00 segment that crosses Center Camp Plaza disappears entirely, because the
    // plan keeps plaza interiors clean. Nothing else should vanish.
    expect(channels.length).toBeGreaterThanOrEqual(GIS_STREETS.length - 1)
    expect(channels.every(f => (f.geometry as any).coordinates.length > 1)).toBe(true)
  })
})

describe('civicLandmarksGeoJson', () => {
  it('emits a point per landmark with finite coords and a category', () => {
    const fc = civicLandmarksGeoJson()
    expect(fc.features.length).toBe(CIVIC_LANDMARKS.length)
    expect(fc.features.length).toBeGreaterThan(8)
    for (const f of fc.features) {
      const [lng, lat] = (f.geometry as any).coordinates
      expect(Number.isFinite(lng) && Number.isFinite(lat)).toBe(true)
      expect(['medical', 'safety', 'transport', 'services', 'sacred']).toContain(f.properties?.category)
    }
  })
})
