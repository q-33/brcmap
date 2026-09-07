// MOOP reporting for DPW Resto — Matter Out Of Place, marked where it lies.
//
// After the burn, Restoration walks the whole city in line sweeps for weeks;
// what they produce becomes the MOOP Map the event's permit depends on. This
// tool lets ANYONE — resto crew or a late-exodus burner staring at a burn
// scar — drop an anonymous pin on the spot so a sweep can find it.
//
// The taxonomy is Resto's own, coarse: what a sweep DOES about a find differs
// by kind (a burn scar gets raked and sifted, gray water gets dug, debris gets
// bagged), and that's the only distinction the pin needs to carry.

export interface MoopCategory {
  key: string
  label: string
  color: string
  icon: string
}

export const MOOP_CATEGORIES: MoopCategory[] = [
  { key: 'burn-scar', label: 'Burn scar', color: '#b91c1c', icon: 'i-lucide-flame' },
  { key: 'gray-water', label: 'Gray water / dump', color: '#0e7490', icon: 'i-lucide-droplets' },
  { key: 'debris', label: 'Debris field', color: '#a16207', icon: 'i-lucide-trash-2' },
  { key: 'wood-metal', label: 'Wood / screws / metal', color: '#57534e', icon: 'i-lucide-hammer' },
  { key: 'carpet-fabric', label: 'Carpet / fabric', color: '#7c3aed', icon: 'i-lucide-layers' },
  { key: 'other', label: 'Other', color: '#dc2626', icon: 'i-lucide-map-pin' },
]

export const MOOP_KEYS = MOOP_CATEGORIES.map(c => c.key)

export function moopCategory(key: string): MoopCategory {
  return MOOP_CATEGORIES.find(c => c.key === key) ?? MOOP_CATEGORIES[MOOP_CATEGORIES.length - 1]!
}

/**
 * Resto's ground covers the event footprint, Gate Road, and the fence line —
 * not Gerlach and not the highway home. A pin outside this radius is a GPS
 * glitch or a prank, and either way it would send a sweep walking to nowhere.
 */
export const MOOP_MAX_KM = 15

/** A pin is worth showing while it's open, and for a day after it's swept. */
export const CLEANED_LINGER_MS = 24 * 3600_000
