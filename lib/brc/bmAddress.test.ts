import { describe, expect, it } from 'vitest'
import { bmAddressString, bmLocationLabel, bmPlacement, bmPlacementToLatLng } from './bmAddress'
import { STREET_RADII, latLngToAddress } from './geocode'

// Burning Man's camps have no coordinates, so every pin we ever draw from their
// API goes through this mapper. A silent mis-parse would put a real camp in the
// wrong block, which is worse than leaving it off the map — hence the emphasis
// on what it REFUSES to place.
describe('bmPlacement', () => {
  it('reads a normal corner in either order', () => {
    const a = bmPlacement({ frontage: '7:30', intersection: 'E', intersection_type: '&' })
    expect(a.kind).toBe('street')
    expect(bmAddressString(a)).toBe('7:30 & E')
    // frontage and intersection arrive both ways round in their data
    const b = bmPlacement({ frontage: 'E', intersection: '7:30', intersection_type: '&' })
    expect(bmAddressString(b)).toBe('7:30 & E')
  })

  it('handles Esplanade and quarter hours', () => {
    expect(bmAddressString(bmPlacement({ frontage: '2:15', intersection: 'Esplanade' })))
      .toBe('2:15 & Esplanade')
    expect(bmAddressString(bmPlacement({ frontage: 'esplanade', intersection: '9:45' })))
      .toBe('9:45 & Esplanade')
  })

  it('places a camp where our own geocoder agrees', () => {
    const p = bmPlacement({ frontage: '7:30', intersection: 'E' })
    const ll = bmPlacementToLatLng(p)
    expect(ll).not.toBeNull()
    const back = latLngToAddress(ll!)
    expect(back.street).toBe('E')
    expect(back.time).toBeCloseTo(7.5, 6)
  })

  it('maps plazas onto the surveyed GIS names', () => {
    const p = bmPlacement({ frontage: '9:00 B Plaza', intersection: null, intersection_type: '@' })
    expect(p).toMatchObject({ kind: 'plaza', plaza: '9:00 & B Plaza' })
    const ll = bmPlacementToLatLng(p)
    expect(ll).not.toBeNull()
    // the 9:00 & B plaza sits on the B ring, so a round trip lands near B
    const back = latLngToAddress(ll!)
    expect(Math.abs(back.distanceM)).toBeLessThan(40)
    expect(bmPlacement({ frontage: 'Center Camp Plaza', intersection_type: '@' }))
      .toMatchObject({ kind: 'plaza', plaza: 'Center Camp Plaza' })
  })

  it('refuses L street, which the 2026 city does not have', () => {
    expect(STREET_RADII.L).toBeUndefined()
    const p = bmPlacement({ frontage: '3:00', intersection: 'L' })
    expect(p.kind).toBe('unplaceable')
    expect((p as any).reason).toContain('L')
  })

  it('refuses addresses outside the street grid rather than guessing', () => {
    for (const frontage of ['Rte 66', 'Rte 66 Z3', 'Airport Road', '9:00 Portal']) {
      const p = bmPlacement({ frontage, intersection: null })
      expect(p.kind, frontage).toBe('unplaceable')
      expect(bmPlacementToLatLng(p), frontage).toBeNull()
    }
  })

  it('refuses partial or unreadable locations', () => {
    expect(bmPlacement(null).kind).toBe('unplaceable')
    expect(bmPlacement({}).kind).toBe('unplaceable')
    expect(bmPlacement({ frontage: '7:30', intersection: null }).kind).toBe('unplaceable')
    expect(bmPlacement({ frontage: '7:30', intersection: '8:00' }).kind).toBe('unplaceable')
    expect(bmPlacement({ frontage: 'E', intersection: 'F' }).kind).toBe('unplaceable')
    expect(bmPlacement({ frontage: '25:99', intersection: 'E' }).kind).toBe('unplaceable')
  })

  it('keeps a readable label for review, whatever it decides', () => {
    expect(bmLocationLabel({ frontage: '7:30', intersection: 'E', intersection_type: '&' }))
      .toBe('7:30 & E')
    expect(bmLocationLabel({ frontage: '9:00 B Plaza', intersection_type: '@' }))
      .toBe('9:00 B Plaza')
    expect(bmLocationLabel({})).toBe('(no location)')
    // an unplaceable camp still carries what they sent, so it can be triaged
    expect(bmPlacement({ frontage: 'Rte 66', intersection: 'K' }).label).toBe('Rte 66 & K')
  })
})
