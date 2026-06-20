import { describe, expect, it } from 'vitest'
import {
  addressToLatLng,
  describeLatLng,
  formatAddress,
  latLngToAddress,
  parseAddress,
} from './geocode'

// Real 2023 block centroids (from Polygons.json) used as ground truth.
const FIXTURES = [
  { time: 3.0, street: 'C', lat: 40.780546, lng: -119.193465 },
  { time: 5.0, street: 'B', lat: 40.777652, lng: -119.205015 },
  { time: 7.5, street: 'E', lat: 40.784919, lng: -119.218287 },
  { time: 9.0, street: 'D', lat: 40.792735, lng: -119.214364 },
  { time: 6.0, street: 'G', lat: 40.776341, lng: -119.215103 },
  { time: 4.5, street: 'F', lat: 40.773981, lng: -119.202429 },
  { time: 2.5, street: 'A', lat: 40.783365, lng: -119.193863 },
  { time: 10.0, street: 'K', lat: 40.801560, lng: -119.210272 },
]

const M_PER_DEG_LAT = 111320
function metresBetween(a: { lat: number, lng: number }, b: { lat: number, lng: number }) {
  const dy = (a.lat - b.lat) * M_PER_DEG_LAT
  const dx = (a.lng - b.lng) * M_PER_DEG_LAT * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dx, dy)
}

describe('addressToLatLng (forward)', () => {
  it('lands within 70 m of every real block centroid', () => {
    for (const f of FIXTURES) {
      const got = addressToLatLng({ time: f.time, street: f.street })!
      const err = metresBetween(got, f)
      expect(err, `${f.time} & ${f.street} off by ${err.toFixed(0)}m`).toBeLessThan(70)
    }
  })

  it('returns null for an unknown street', () => {
    expect(addressToLatLng({ time: 6, street: 'Z' })).toBeNull()
  })
})

describe('latLngToAddress (reverse)', () => {
  it('recovers the correct street and time for each fixture', () => {
    for (const f of FIXTURES) {
      const addr = latLngToAddress({ lat: f.lat, lng: f.lng })
      expect(addr.street).toBe(f.street)
      expect(Math.abs(addr.time - f.time)).toBeLessThan(0.25) // within 15 min
    }
  })
})

describe('round-trip', () => {
  it('address -> latlng -> address is stable', () => {
    for (const f of FIXTURES) {
      const ll = addressToLatLng({ time: f.time, street: f.street })!
      const back = latLngToAddress(ll)
      expect(back.street).toBe(f.street)
      expect(Math.abs(back.time - f.time)).toBeLessThan(0.05)
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

describe('describeLatLng', () => {
  it('gives a human readout near a known block', () => {
    const e = describeLatLng({ lat: 40.784919, lng: -119.218287 })
    expect(e).toBe('near 7:30 & E')
  })
})
