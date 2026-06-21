// Registry of gated "upcoming" features. Admins grant these per-user; the app
// checks the current user's granted features to unlock the UI. Add new keys here.
export interface FeatureDef { key: string, label: string, description: string }

export const FEATURES: FeatureDef[] = [
  {
    key: 'manual-address',
    label: 'Manual address entry',
    description: 'Place a camp or artwork by typing a BRC address (e.g. “7:30 & E”) without needing GPS — useful for marking before arrival.',
  },
]

export const FEATURE_KEYS = FEATURES.map(f => f.key)

export function isFeatureKey(k: string): boolean {
  return FEATURE_KEYS.includes(k)
}
