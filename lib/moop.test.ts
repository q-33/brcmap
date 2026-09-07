import { describe, expect, it } from 'vitest'
import { CLEANED_LINGER_MS, MOOP_CATEGORIES, MOOP_KEYS, MOOP_MAX_KM, moopCategory } from './moop'

// A sweep walks to every one of these pins. The categories and bounds decide
// whether that walk is ever wasted.
describe('moop taxonomy', () => {
  it('keys are unique and kebab-case', () => {
    expect(new Set(MOOP_KEYS).size).toBe(MOOP_KEYS.length)
    for (const k of MOOP_KEYS)
      expect(k).toMatch(/^[a-z][a-z-]*$/)
  })

  it('every category is fully drawn — label, colour, icon', () => {
    for (const c of MOOP_CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(2)
      expect(c.color).toMatch(/^#[0-9a-f]{6}$/)
      expect(c.icon).toMatch(/^i-lucide-/)
    }
  })

  it('an unknown key degrades to Other rather than crashing a pin', () => {
    expect(moopCategory('weird-legacy-key').key).toBe('other')
    expect(moopCategory('burn-scar').label).toBe('Burn scar')
  })

  it('bounds cover the fence line but not the drive home', () => {
    // trash fence is ~2.4 km out; Gate Road pavement ~10 km; Gerlach ~35 km
    expect(MOOP_MAX_KM).toBeGreaterThan(11)
    expect(MOOP_MAX_KM).toBeLessThan(30)
  })

  it('swept pins linger long enough for the crew to see their work', () => {
    expect(CLEANED_LINGER_MS).toBeGreaterThanOrEqual(12 * 3600_000)
  })
})
