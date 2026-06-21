import { z } from 'zod'

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().trim().min(1).max(80).optional(),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const campSchema = z.object({
  name: z.string().trim().min(1).max(200),
  year: z.number().int().gte(1986).lte(2100),
  description: z.string().max(2000).optional(),
  website: z.string().url().optional().or(z.literal('')),
  contactEmail: z.string().email().optional().or(z.literal('')),
  hometown: z.string().max(200).optional(),
})

// Events: a camp announces a planned event. starts/ends are playa wall-clock
// strings (e.g. "2026-08-31T15:00") from a datetime-local input.
export const eventSchema = z.object({
  campId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).optional(),
  startsAt: z.string().min(1).max(40),
  endsAt: z.string().max(40).optional().or(z.literal('')),
}).refine(d => !d.endsAt || d.endsAt >= d.startsAt, {
  message: 'End time must be after the start time',
})

// A location is marked by its BRC address; coordinates are geocoded server-side.
export const locationSchema = z.object({
  campId: z.string().uuid().optional(),
  artId: z.string().uuid().optional(),
  addressString: z.string().trim().min(1).max(40), // e.g. "7:30 & E"
}).refine(d => !!d.campId !== !!d.artId, {
  message: 'Provide exactly one of campId or artId',
})
