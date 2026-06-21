import { describe, expect, it } from 'vitest'
import { cityGridGeoJson, manPoint } from './cityGeoJson'

describe('cityGridGeoJson', () => {
  const fc = cityGridGeoJson()

  it('produces street arcs, radial blocks, the camping band, and named labels', () => {
    const streets = fc.features.filter(f => f.properties?.kind === 'street')
    const radials = fc.features.filter(f => f.properties?.kind === 'radial')
    const labels = fc.features.filter(f => f.properties?.kind === 'street-label')
    const camping = fc.features.filter(f => f.properties?.kind === 'camping')
    const portals = fc.features.filter(f => f.properties?.kind === 'portal')
    expect(streets.length).toBe(12) // Esplanade + A..K
    expect(radials.length).toBeGreaterThan(20) // every 15 min, 2:00–10:00
    expect(labels.length).toBe(12)
    expect(camping.length).toBe(1)
    expect(portals.length).toBe(5) // Center Camp + 3:00/9:00/4:30/7:30
    expect(labels.find(l => l.properties?.letter === 'E')?.properties?.name).toBe('Eternal')
  })

  it('contains no NaN coordinates', () => {
    const lines = fc.features.filter(f => f.geometry.type === 'LineString')
    const coords = lines.flatMap(f => (f.geometry as any).coordinates as [number, number][])
    expect(coords.length).toBeGreaterThan(0)
    expect(coords.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b))).toBe(true)
  })

  it('centers near the Man', () => {
    expect(manPoint[0]).toBeCloseTo(-119.2035, 2)
    expect(manPoint[1]).toBeCloseTo(40.7864, 2)
  })
})
