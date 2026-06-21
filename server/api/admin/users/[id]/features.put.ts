import { and, eq, inArray } from 'drizzle-orm'
import { featuresSchema } from '../../../../utils/validation'
import { userFeatures } from '../../../../db/schema'
import { FEATURE_KEYS } from '~~/lib/features'

// Admin: set the full set of a user's granted feature flags.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Missing id' })

  const { features } = await readValidatedBody(event, featuresSchema.parse)
  const want = [...new Set(features.filter(f => FEATURE_KEYS.includes(f)))]
  const db = useDb()

  const current = await db.select({ feature: userFeatures.feature }).from(userFeatures).where(eq(userFeatures.userId, id))
  const have = current.map(r => r.feature)
  const toAdd = want.filter(f => !have.includes(f))
  const toRemove = have.filter(f => !want.includes(f))

  if (toRemove.length)
    await db.delete(userFeatures).where(and(eq(userFeatures.userId, id), inArray(userFeatures.feature, toRemove)))
  if (toAdd.length)
    await db.insert(userFeatures).values(toAdd.map(feature => ({ userId: id, feature, grantedById: admin.id })))

  await audit(admin.id, 'feature.set', { targetType: 'user', targetId: id, detail: want.join(',') || '(none)' })
  return { features: want }
})
