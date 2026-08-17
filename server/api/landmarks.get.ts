import { landmarkOverrides } from '../db/schema'

// Admin corrections to civic landmark positions. Public, because the map needs
// them to draw — they are just coordinates, and the landmarks themselves are
// public infrastructure.
//
// Read defensively: if the table is missing (migration not yet applied) or the
// DB is unreachable, return an empty list so the map falls back to the shipped
// constants rather than losing every landmark.
export default defineCachedEventHandler(async () => {
  try {
    const rows = await useDb()
      .select({
        name: landmarkOverrides.name,
        lat: landmarkOverrides.lat,
        lng: landmarkOverrides.lng,
        note: landmarkOverrides.note,
      })
      .from(landmarkOverrides)
    return rows
  }
  catch {
    return []
  }
}, { maxAge: 60, swr: true, name: 'landmark-overrides', getKey: () => 'all' })
