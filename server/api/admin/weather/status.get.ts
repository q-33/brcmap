// Admin: which weather providers are actually configured.
//
// Exists because "Could not add that station" is a useless thing to read when
// the real answer is "nobody has given us a key yet". The panel asks this first
// and says so plainly, instead of letting an admin type an ID and guess.
//
// Reports only whether each key is PRESENT — never any part of its value.
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return {
    wunderground: wuConfigured(),
    tempest: tempestConfigured(),
  }
})
