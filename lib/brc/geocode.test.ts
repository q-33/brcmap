import { describe, expect, it } from 'vitest'
import {
  CITY_YEAR,
  MAN,
  STREET_RADII,
  STREET_NAMES,
  addressToLatLng,
  calibrateCityCenter,
  describeLatLng,
  formatAddress,
  formatAddressNamed,
  getCityCenter,
  goldenSpikeKnown,
  latLngToAddress,
  parseAddress,
  parseLatLng,
  streetName,
} from './geocode'

// A spread of addresses across the city for round-trip checks.
const ADDRS = [
  { time: 3.0, street: 'C' },
  { time: 5.0, street: 'B' },
  { time: 7.5, street: 'E' },
  { time: 9.0, street: 'D' },
  { time: 6.0, street: 'G' },
  { time: 4.5, street: 'F' },
  { time: 2.5, street: 'A' },
  { time: 10.0, street: 'K' },
]

const M_PER_DEG_LAT = 111320
function metresBetween(a: { lat: number, lng: number }, b: { lat: number, lng: number }) {
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT
  const dx = (a.lng - b.lng) * M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

describe('addressToLatLng (forward)', () => {
  it('returns a point for a valid street, null for an unknown one', () => {
    expect(addressToLatLng({ time: 6, street: 'E' })).toBeTruthy()
    expect(addressToLatLng({ time: 6, street: 'Z' })).toBeNull()
  })

  it('places streets inner -> outer (Esplanade nearest the Man, K furthest)', () => {
    const order = ['Esplanade', 'A', 'E', 'K']
    const dists = order.map(s => metresBetween(addressToLatLng({ time: 6, street: s })!, MAN))
    for (let i = 1; i < dists.length; i++)
      expect(dists[i]!).toBeGreaterThan(dists[i - 1]!)
    // real, to-scale radii (NOT stylised): Esplanade sits ~792 m from the Man so
    // geocoding matches the device's real GPS. Guards against re-introducing the
    // compression that drifted reverse-geocoding by 1-2 streets.
    expect(STREET_RADII.Esplanade!).toBeGreaterThan(750)
    expect(STREET_RADII.Esplanade!).toBeLessThan(850)
    expect(STREET_RADII.K!).toBeGreaterThan(1700)
  })
})

describe('round-trip address <-> latlng (internally consistent)', () => {
  it('forward then reverse recovers the address', () => {
    for (const a of ADDRS) {
      const ll = addressToLatLng(a)!
      const back = latLngToAddress(ll)
      expect(back.street).toBe(a.street)
      expect(Math.abs(back.time - a.time)).toBeLessThan(0.05)
    }
  })
})

describe('parse / format', () => {
  it('parses both orderings', () => {
    expect(parseAddress('7:30 & E')).toEqual({ time: 7.5, street: 'E' })
    expect(parseAddress('E & 7:30')).toEqual({ time: 7.5, street: 'E' })
  })
  it('rejects nonsense', () => {
    expect(parseAddress('hello')).toBeNull()
    expect(parseAddress('7:30 & Z')).toBeNull()
  })
  it('formats with 15-min rounding', () => {
    expect(formatAddress({ time: 7.5, street: 'E' })).toBe('7:30 & E')
    expect(formatAddress({ time: 7.51, street: 'E' })).toBe('7:30 & E')
  })
})

describe('2026 street names', () => {
  it('is the 2026 city', () => {
    expect(CITY_YEAR).toBe(2026)
    expect(Object.keys(STREET_NAMES)).toHaveLength(12) // Esplanade + A..K
  })
  it('maps letters to themed names', () => {
    expect(streetName('E')).toBe('Eternal')
    expect(streetName('A')).toBe('Ararat')
    expect(streetName('K')).toBe('Kundalini')
    expect(streetName('Esplanade')).toBe('Esplanade')
  })
  it('falls back to the letter for unknown streets', () => {
    expect(streetName('Z')).toBe('Z')
  })
  it('formatAddressNamed uses the themed name', () => {
    expect(formatAddressNamed({ time: 7.5, street: 'E' })).toBe('7:30 & Eternal')
  })
})

describe('describeLatLng', () => {
  it('gives a human readout with the themed street name', () => {
    const ll = addressToLatLng({ time: 7.5, street: 'E' })!
    expect(describeLatLng(ll)).toBe('near 7:30 & Eternal')
  })
})

describe('golden spike calibration', () => {
  it('parses "lat,lng" and rejects junk', () => {
    expect(parseLatLng('40.78,-119.20')).toEqual({ lat: 40.78, lng: -119.2 })
    expect(parseLatLng('  40.5 , -119.1 ')).toEqual({ lat: 40.5, lng: -119.1 })
    expect(parseLatLng('')).toBeNull()
    expect(parseLatLng('nope')).toBeNull()
    expect(parseLatLng('200,0')).toBeNull() // out of range
  })

  it('re-anchors the whole city to a new center', () => {
    const before = addressToLatLng({ time: 6, street: 'E' })!
    const newCenter = { lat: 41, lng: -119 }
    calibrateCityCenter(newCenter)
    expect(goldenSpikeKnown()).toBe(true)
    expect(getCityCenter()).toEqual(newCenter)
    // the same address now resolves to a different absolute point
    const after = addressToLatLng({ time: 6, street: 'E' })!
    expect(Math.abs(after.lat - before.lat)).toBeGreaterThan(0.1)
    // restore the default so other tests in this file are unaffected
    calibrateCityCenter({ lat: 40.786394, lng: -119.203492 }, false)
  })
})
