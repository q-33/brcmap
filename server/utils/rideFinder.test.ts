import { describe, expect, it } from 'vitest'
import { mapRfListing, type RfListing } from './rideFinder'

// Somebody else's users are being shown on our page through this mapper. The
// worst failures are showing a ride that no longer exists, or misstating which
// way it is going.
const NOW = Date.parse('2026-09-06T00:00:00Z')
const base: RfListing = {
  id: 'x1',
  type: 'driver',
  direction: 'from_brc',
  name: 'Dan',
  location: 'Portland, OR',
  travelDate: '2026-09-06',
  timeSlot: 'flexible',
  details: 'room for two',
  campInfo: '7:30 & E',
  passengerSpace: 2,
  cargoSpace: 'standard',
  routeDetails: 'via Reno',
  riderStuff: null,
  expiresAt: '2026-09-07T00:00:00Z',
  cancelledAt: null,
  createdAt: '2026-09-01T00:00:00Z',
}

describe('RideFinder mirror mapping', () => {
  it('maps a driver to an offer, with seats and route', () => {
    const m = mapRfListing(base, NOW)!
    expect(m.kind).toBe('offer')
    expect(m.seats).toBe(2)
    expect(m.destination).toBe('Portland, OR')
    expect(m.note).toContain('room for two')
    expect(m.note).toContain('Route: via Reno')
    expect(m.url).toBe('https://ridefinder.site/listing/x1')
  })

  it('maps a rider to a request, with their stuff as luggage', () => {
    const m = mapRfListing({ ...base, type: 'rider', riderStuff: 'substantial', passengerSpace: 0 }, NOW)!
    expect(m.kind).toBe('request')
    expect(m.luggage).toBe('substantial')
    expect(m.seats).toBeNull() // a rider's passengerSpace is not seats on offer
  })

  it('states the direction honestly in the destination', () => {
    expect(mapRfListing({ ...base, direction: 'to_brc' }, NOW)!.destination)
      .toBe('Black Rock City (from Portland, OR)')
    expect(mapRfListing(base, NOW)!.destination).toBe('Portland, OR')
  })

  it('drops cancelled and expired listings — a dead ride must not be shown', () => {
    expect(mapRfListing({ ...base, cancelledAt: '2026-09-02T00:00:00Z' }, NOW)).toBeNull()
    expect(mapRfListing({ ...base, expiresAt: '2026-09-05T00:00:00Z' }, NOW)).toBeNull()
    // not yet expired stays
    expect(mapRfListing({ ...base, expiresAt: '2026-09-06T01:00:00Z' }, NOW)).not.toBeNull()
  })

  it('renders the travel day on the playa calendar, not UTC', () => {
    // 2026-09-06 must read Sep 6 — parsing it as UTC midnight and printing in a
    // western zone would say Sep 5 and send someone a day early
    const m = mapRfListing(base, NOW)!
    expect(m.departs).toContain('Sep 6')
  })

  it('hides the flexible time slot but keeps a real one', () => {
    expect(mapRfListing(base, NOW)!.departs).not.toContain('flexible')
    expect(mapRfListing({ ...base, timeSlot: 'morning' }, NOW)!.departs).toContain('morning')
  })
})
