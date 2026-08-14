import { describe, expect, it } from 'vitest'
import { CIVIC_LANDMARKS, cityGridGeoJson, civicLandmarksGeoJson, getManPoint, washCorners } from './cityGeoJson'
import { STREET_RADII, latLngToAddress } from './geocode'
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

// Reported by Amanda: medical and the Ranger outposts at 3:00 and 9:00 were
// pinned at the B plazas. They are on C — about 105 m further out — and Burning
// Man's own 2026 GIS (cpns.geojson) puts ESD Station 3/9 and Ranger Stations
// Berlin/Tokyo at 1084–1094 m from the Man. People read these looking for help,
// so the positions are pinned here rather than left to drift.
describe('emergency services at 3:00 and 9:00', () => {
  const fc = civicLandmarksGeoJson()
  const at = (name: string) => {
    const f = fc.features.find(x => x.properties?.name === name)
    expect(f, `${name} missing`).toBeTruthy()
    const [lng, lat] = (f!.geometry as any).coordinates
    return latLngToAddress({ lat, lng })
  }

  it('puts first aid on C, not the B plazas', () => {
    for (const name of ['First Aid · 3:00', 'First Aid · 9:00']) {
      const a = at(name)
      expect(a.street, name).toBe('C')
      expect(a.distanceM, `${name} should sit within a block of C`).toBeLessThan(45)
    }
    expect(at('First Aid · 3:00').time).toBeCloseTo(3, 1)
    expect(at('First Aid · 9:00').time).toBeCloseTo(9, 1)
  })

  it('puts the Ranger outposts on C too, in the safety layer', () => {
    for (const name of ['Ranger · Berlin', 'Ranger · Tokyo']) {
      const a = at(name)
      expect(a.street, name).toBe('C')
      const f = fc.features.find(x => x.properties?.name === name)
      expect(f!.properties?.category, name).toBe('safety')
    }
    expect(at('Ranger · Berlin').time).toBeCloseTo(3, 1)
    expect(at('Ranger · Tokyo').time).toBeCloseTo(9, 1)
  })

  it('keeps medical and Rangers co-located at each corner', () => {
    const pair = (a: string, b: string) => {
      const x = at(a)
      const y = at(b)
      expect(x.street).toBe(y.street)
      expect(Math.abs(x.time - y.time)).toBeLessThan(0.1)
    }
    pair('First Aid · 3:00', 'Ranger · Berlin')
    pair('First Aid · 9:00', 'Ranger · Tokyo')
  })
})

// The gate complex and deep-playa zones come from the official CPN file. They
// sit far outside the drawn city, so a regression that quietly snapped them onto
// a lettered street would be easy to miss by eye.
describe('landmarks beyond the outer street', () => {
  const fc = civicLandmarksGeoJson()
  const at = (name: string) => {
    const f = fc.features.find(x => x.properties?.name === name)
    expect(f, `${name} missing`).toBeTruthy()
    const [lng, lat] = (f!.geometry as any).coordinates
    return { f: f!, r: Math.hypot((lng + 119.207871) * 84360, (lat - 40.783242) * 111320) }
  }

  it('keeps the gate complex out past K where it belongs', () => {
    const kRadius = STREET_RADII.K!
    for (const name of ['Gate Actual', 'Box Office', 'Will Call Lot', 'D Lot', 'Census Checkpoint']) {
      const { r, f } = at(name)
      expect(r, `${name} should be beyond K`).toBeGreaterThan(kRadius + 500)
      expect(f.properties?.category, name).toBe('transport')
    }
    // Will Call is the furthest out of the gate cluster
    expect(at('Will Call Lot').r).toBeGreaterThan(at('Box Office').r)
  })

  it('places both deep-playa music zones outside the city', () => {
    for (const name of ['Deep-Playa Music Zone', 'Deep-Playa Music Zone 2'])
      expect(at(name).r, name).toBeGreaterThan(STREET_RADII.K!)
  })

  it('keeps the Census Checkpoint distinct from the in-city Census camp', () => {
    // their CPN "Census Checkpoint" is the Gate Road survey point; our "Census"
    // is the camp in the 6:30 wedge. Conflating them threw a pin 1.5 km out.
    expect(at('Census Checkpoint').r - at('Census').r).toBeGreaterThan(1000)
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
