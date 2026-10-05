import { describe, expect, it } from 'vitest'
import { clientIpFromHeaders } from './clientIp'

// Every per-IP limit on the site keys off this. Before 2026-10 the code took
// the FIRST X-Forwarded-For hop, which the client writes — one header defeated
// login, register, contact and the anonymous report limits.
describe('clientIpFromHeaders', () => {
  it('prefers the platform header the ingress overwrites', () => {
    expect(clientIpFromHeaders({ 'do-connecting-ip': '203.0.113.9', 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }, '10.0.0.1')).toBe('203.0.113.9')
  })
  it('ignores a client-supplied first hop and takes the last', () => {
    expect(clientIpFromHeaders({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, '10.0.0.1')).toBe('203.0.113.9')
  })
  it('falls back to the socket address', () => {
    expect(clientIpFromHeaders({}, '10.0.0.1')).toBe('10.0.0.1')
    expect(clientIpFromHeaders({})).toBe('unknown')
  })
  it('does not trust an empty platform header', () => {
    expect(clientIpFromHeaders({ 'do-connecting-ip': '  ', 'x-forwarded-for': '203.0.113.9' })).toBe('203.0.113.9')
  })
})
