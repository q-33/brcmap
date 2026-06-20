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

// A location is marked by its BRC address; coordinates are geocoded server-side.
export const locationSchema = z.object({
  campId: z.string().uuid().optional(),
  artId: z.string().uuid().optional(),
  addressString: z.string().trim().min(1).max(40), // e.g. "7:30 & E"
}).refine(d => !!d.campId !== !!d.artId, {
  message: 'Provide exactly one of campId or artId',
})
