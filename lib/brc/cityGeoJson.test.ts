import { describe, expect, it } from 'vitest'
import { CIVIC_LANDMARKS, cityGridGeoJson, civicLandmarksGeoJson, getManPoint } from './cityGeoJson'

describe('cityGridGeoJson', () => {
  const fc = cityGridGeoJson()

  it('produces blue blocks, street-name labels, and the five portals', () => {
    const blocks = fc.features.filter(f => f.properties?.kind === 'block')
    const labels = fc.features.filter(f => f.properties?.kind === 'street-label')
    const portals = fc.features.filter(f => f.properties?.kind === 'portal')
    expect(blocks.length).toBeGreaterThan(200) // 11 ring bands × ~31 columns
    expect(labels.length).toBe(12) // Esplanade + A..K
    expect(portals.length).toBe(10) // Center Camp + B ring (4) + G ring (5)
    expect(labels.find(l => l.properties?.name === 'Eternal')).toBeTruthy()
  })

  it('contains no NaN coordinates', () => {
    const polys = fc.features.filter(f => f.geometry.type === 'Polygon')
    const coords = polys.flatMap(f => (f.geometry as any).coordinates[0] as [number, number][])
    expect(coords.length).toBeGreaterThan(0)
    expect(coords.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b))).toBe(true)
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
