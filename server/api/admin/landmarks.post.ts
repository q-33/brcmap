import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { landmarkOverrides } from '../../db/schema'
import { CIVIC_LANDMARKS } from '../../../lib/brc/cityGeoJson'

// Admin: move a civic landmark, or put it back.
//
//   POST /api/admin/landmarks  { name, lat, lng, note? }   move it
//   POST /api/admin/landmarks  { name, reset: true }        revert to the code
//
// Only names that exist in CIVIC_LANDMARKS are accepted, so a typo cannot create
// a phantom landmark that the map will never draw. Every change is audited —
// these pins include medical and Ranger stations, and a silent move is the kind
// of thing that should leave a trace.
const bodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  note: z.string().trim().max(300).optional(),
  reset: z.boolean().optional(),
}).refine(d => d.reset === true || (d.lat != null && d.lng != null), {
  message: 'lat and lng are required unless reset is true',
})

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const known = CIVIC_LANDMARKS.find(l => l.name === body.name)
  if (!known)
    throw createError({ statusCode: 404, statusMessage: `No civic landmark named "${body.name}"` })

  const db = useDb()

  if (body.reset) {
    await db.delete(landmarkOverrides).where(eq(landmarkOverrides.name, body.name))
    await audit(admin.id, 'landmark-reset', { targetType: 'landmark', targetId: body.name })
    return { name: body.name, reset: true }
  }

  const values = {
    name: body.name,
    lat: body.lat!,
    lng: body.lng!,
    note: body.note ?? null,
    movedById: admin.id,
    updatedAt: new Date(),
  }
  await db.insert(landmarkOverrides).values(values).onConflictDoUpdate({
    target: landmarkOverrides.name,
    set: { lat: values.lat, lng: values.lng, note: values.note, movedById: admin.id, updatedAt: values.updatedAt },
  })
  await audit(admin.id, 'landmark-move', {
    targetType: 'landmark',
    targetId: body.name,
    detail: `${body.lat!.toFixed(6)}, ${body.lng!.toFixed(6)}`,
  })
  return { name: body.name, lat: body.lat, lng: body.lng }
})
