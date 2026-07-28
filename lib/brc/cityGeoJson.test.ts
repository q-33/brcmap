import { describe, expect, it } from 'vitest'
import { CIVIC_LANDMARKS, cityGridGeoJson, civicLandmarksGeoJson, getManPoint, washCorners } from './cityGeoJson'

describe('cityGridGeoJson', () => {
  const fc = cityGridGeoJson()

  it('produces blocks, street-name labels, and the portal circles', () => {
    const blocks = fc.features.filter(f => f.properties?.kind === 'block')
    const labels = fc.features.filter(f => f.properties?.kind === 'street-label')
    const portals = fc.features.filter(f => f.properties?.kind === 'portal')
    expect(blocks.length).toBeGreaterThan(200) // 11 ring bands × ~31 columns
    expect(labels.length).toBe(12) // Esplanade + A..K
    // Man + 12:00 + 2 plaza-edge arcs + café + 2 V lines + 9 clock plaza rings
    expect(portals.length).toBe(16)
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
