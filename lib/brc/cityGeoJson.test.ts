import { describe, expect, it } from 'vitest'
import { cityGridGeoJson, getManPoint } from './cityGeoJson'

describe('cityGridGeoJson', () => {
  const fc = cityGridGeoJson()

  it('produces blue blocks, street-name labels, and the five portals', () => {
    const blocks = fc.features.filter(f => f.properties?.kind === 'block')
    const labels = fc.features.filter(f => f.properties?.kind === 'street-label')
    const portals = fc.features.filter(f => f.properties?.kind === 'portal')
    expect(blocks.length).toBeGreaterThan(200) // 11 ring bands × ~31 columns
    expect(labels.length).toBe(12) // Esplanade + A..K
    expect(portals.length).toBe(5) // Center Camp + 3:00/9:00/4:30/7:30
    expect(labels.find(l => l.properties?.name === 'Eternal')).toBeTruthy()
  })

  it('contains no NaN coordinates', () => {
    const polys = fc.features.filter(f => f.geometry.type === 'Polygon')
    const coords = polys.flatMap(f => (f.geometry as any).coordinates[0] as [number, number][])
    expect(coords.length).toBeGreaterThan(0)
    expect(coords.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b))).toBe(true)
  })

  it('centers near the Man', () => {
    const man = getManPoint()
    expect(man[0]).toBeCloseTo(-119.2035, 2)
    expect(man[1]).toBeCloseTo(40.7864, 2)
  })
})
