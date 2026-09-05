import { desc, eq, or } from 'drizzle-orm'
import { rideConnections } from '../../../db/schema'

// My connections, from either side. The counterpart's position is returned
// ONLY while the connection is active — a pending or ended row never carries
// a fix (the write paths guarantee it, and this read path refuses anyway).
export default defineEventHandler(async (event) => {
  const user = await getFreshUser(event)
  if (!user)
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  const db = useDb()
  const rows = await db.query.rideConnections.findMany({
    orderBy: [desc(rideConnections.updatedAt)],
    limit: 50,
    with: {
      ride: { with: { owner: { columns: { id: true, displayName: true, playaName: true } } } },
      requester: { columns: { id: true, displayName: true, playaName: true } },
    },
  })
  const mine = rows.filter(r => r.requesterId === user.id || r.ride?.owner?.id === user.id)
  return mine.map((r) => {
    const iAmOwner = r.ride?.owner?.id === user.id
    const other = iAmOwner ? r.requester : r.ride?.owner
    const active = r.status === 'active'
    const otherPos = active
      ? (iAmOwner
          ? (r.requesterLat != null ? { lat: r.requesterLat, lng: r.requesterLng, at: r.requesterAt } : null)
          : (r.ownerLat != null ? { lat: r.ownerLat, lng: r.ownerLng, at: r.ownerAt } : null))
      : null
    return {
      id: r.id,
      status: r.status,
      iAmOwner,
      ride: r.ride ? { id: r.ride.id, kind: r.ride.kind, destination: r.ride.destination, departs: r.ride.departs, status: r.ride.status } : null,
      other: other ? { id: other.id, name: (other as any).playaName || other.displayName || 'A burner' } : null,
      otherPos,
      updatedAt: r.updatedAt,
    }
  })
})
