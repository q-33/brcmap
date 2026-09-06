import { fetchRideFinder } from '../../utils/rideFinder'

// The RideFinder mirror: their public board, mapped to our shape, cached for
// five minutes. A dead upstream degrades to {available:false} — our own board
// must never break because somebody else's site is down.
export default defineCachedEventHandler(async () => {
  try {
    const listings = await fetchRideFinder(Date.now())
    return { available: true, listings }
  }
  catch {
    return { available: false, listings: [] }
  }
}, { maxAge: 300, swr: true, name: 'ridefinder', getKey: () => 'all' })
