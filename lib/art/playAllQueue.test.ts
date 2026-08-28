import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TOUR_EXTRAS, TOUR_TRACKS, audioUrl } from './audioTour'

// Mirrors the queue AudioTourPlayAll builds.
const QUEUE = [...TOUR_EXTRAS, ...TOUR_TRACKS].sort((a, b) => a.n - b.n)

describe('play-all queue', () => {
  it('runs 0 to 87 with nothing missing or repeated', () => {
    expect(QUEUE.length).toBe(88)
    expect(QUEUE.map(t => t.n)).toEqual(Array.from({ length: 88 }, (_, i) => i))
  })

  it('opens on the introduction and closes on the theme talk', () => {
    expect(QUEUE[0]!.n).toBe(0)
    expect(QUEUE[0]!.title).toMatch(/Introduction/i)
    expect(QUEUE.at(-1)!.n).toBe(87)
    expect(QUEUE.at(-1)!.title).toMatch(/Theme/i)
  })

  it('puts the artworks in tour order between them', () => {
    const middle = QUEUE.slice(1, -1)
    expect(middle.length).toBe(86)
    expect(middle.map(t => t.n)).toEqual(Array.from({ length: 86 }, (_, i) => i + 1))
  })

  it('every track in the queue has a file on disk', () => {
    // a queue that plays to a 404 halfway through is worse than no queue
    const missing = QUEUE.filter(t => !existsSync(`public${audioUrl(t)}`))
    expect(missing.map(t => t.file)).toEqual([])
  })
})
