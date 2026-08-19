import { describe, expect, it } from 'vitest'
import { TOUR_EXTRAS, TOUR_TRACKS, audioForArt, audioUrl, normalizeArtName } from './audioTour'

describe('art audio tour', () => {
  it('carries every released track exactly once', () => {
    expect(TOUR_TRACKS.length).toBe(86)
    expect(TOUR_EXTRAS.length).toBe(2)
    const all = [...TOUR_TRACKS, ...TOUR_EXTRAS]
    expect(new Set(all.map(t => t.n)).size).toBe(88)
    expect(new Set(all.map(t => t.file)).size).toBe(88)
  })

  it('numbers the artwork tracks 1..86, with 0 and 87 as the extras', () => {
    expect(TOUR_TRACKS.map(t => t.n)).toEqual(Array.from({ length: 86 }, (_, i) => i + 1))
    expect(TOUR_EXTRAS.map(t => t.n)).toEqual([0, 87])
  })

  it('matches artwork names ignoring case and punctuation', () => {
    // the release misspells several titles; the build script corrects them
    expect(audioForArt('Aetheric Ascension Tower')?.n).toBe(5)
    expect(audioForArt('The Portal of Collective Imagination')?.n).toBe(55)
    expect(audioForArt('Apotheneum')?.n).toBe(56)
    expect(audioForArt('D.A.R.E – Does Art Reside Everywhere?')?.n).toBe(79)
    // punctuation and case must not matter
    expect(audioForArt('axis mundi resonant spire')?.n).toBe(2)
    expect(audioForArt('Axis Mundi: Resonant Spire')?.n).toBe(2)
  })

  it('never guesses: an unknown artwork gets no track', () => {
    expect(audioForArt('Some Camp That Is Not Art')).toBeNull()
    expect(audioForArt('')).toBeNull()
    expect(audioForArt(null)).toBeNull()
    expect(audioForArt(undefined)).toBeNull()
  })

  it('serves from /audio/tour with a safe filename', () => {
    for (const t of [...TOUR_TRACKS, ...TOUR_EXTRAS]) {
      expect(audioUrl(t)).toBe(`/audio/tour/${t.file}`)
      expect(t.file).toMatch(/^\d{2}-[a-z0-9-]+\.m4a$/)
    }
  })

  it('normalises the way the matcher expects', () => {
    expect(normalizeArtName('Brews 12 v Uno: cLOUD OF WIT-nesses')).toBe('brews 12 v uno cloud of wit nesses')
    expect(normalizeArtName('Salt & Pepper')).toBe('salt and pepper')
  })
})
