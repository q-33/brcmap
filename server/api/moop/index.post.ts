import { and, gte, eq, sql as dsql } from 'drizzle-orm'
import { z } from 'zod'
import { pacificDateOf } from '~~/lib/burns'
import { MOOP_KEYS, MOOP_MAX_KM } from '~~/lib/moop'
import { kmFromCity } from '~~/lib/weather/stations'
import { moopReports } from '../../db/schema'
import { visitorKey } from '../../utils/pulse'

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  category: z.enum(MOOP_KEYS as [string, ...string[]]),
  note: z.string().trim().max(280).optional().or(z.literal('')),
})

// Drop an anonymous MOOP pin. A resto worker on a line sweep may hit dozens of
// finds an hour, so the rate limit is generous — one pin a minute — with a
// daily ceiling so a hot phone in a pocket can't paint the playa.
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, schema.parse)

  // Resto's ground only. A pin in Gerlach sends a sweep walking to nowhere.
  const km = kmFromCity(body.lat, body.lng)
  if (km > MOOP_MAX_KM) {
    throw createError({
      statusCode: 400,
      statusMessage: `That's ${Math.round(km)} km from the city — MOOP pins cover the event site and Gate Road only.`,
    })
  }

  const secret = (useRuntimeConfig().session?.password as string) || 'brcmap-pulse'
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
  const ua = getRequestHeader(event, 'user-agent') ?? 'unknown'
  const visitor = visitorKey(secret, pacificDateOf(Date.now()), ip, ua)

  const db = useDb()
  const [recent] = await db.select({ n: dsql<number>`count(*)::int` }).from(moopReports)
    .where(and(eq(moopReports.visitor, visitor), gte(moopReports.createdAt, new Date(Date.now() - 60_000))))
  if ((recent?.n ?? 0) > 0)
    throw createError({ statusCode: 429, statusMessage: 'One pin a minute — it will still be there.' })
  const [today] = await db.select({ n: dsql<number>`count(*)::int` }).from(moopReports)
    .where(and(eq(moopReports.visitor, visitor), gte(moopReports.createdAt, new Date(Date.now() - 86_400_000))))
  if ((today?.n ?? 0) >= 200)
    throw createError({ statusCode: 429, statusMessage: 'Daily pin limit reached.' })

  const [row] = await db.insert(moopReports).values({
    visitor,
    lat: body.lat,
    lng: body.lng,
    category: body.category,
    note: body.note || null,
  }).returning({ id: moopReports.id })
  return { ok: true, id: row!.id }
})
