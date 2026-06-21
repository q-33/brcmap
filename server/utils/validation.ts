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

export const artSchema = z.object({
  name: z.string().trim().min(1).max(200),
  year: z.number().int().gte(1986).lte(2100),
  description: z.string().max(2000).optional(),
  website: z.string().url().optional().or(z.literal('')),
  contactEmail: z.string().email().optional().or(z.literal('')),
  hometown: z.string().max(200).optional(),
  // Optional "open call" prompt asking the community to contribute.
  call: z.string().max(2000).optional(),
})

// Owners set or clear an artwork's open call.
export const artCallSchema = z.object({
  call: z.string().max(2000).optional().or(z.literal('')),
})

// A community contribution to an artwork's open call (logged-in users only).
export const artContributionSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  language: z.string().trim().max(80).optional().or(z.literal('')),
  mediaUrl: z.string().url().max(500).optional().or(z.literal('')),
})

// Owner moderation: publish or hide a submitted contribution.
export const artContributionModerateSchema = z.object({
  status: z.enum(['published', 'hidden', 'pending']),
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

// A GPE-posted Gate Road condition for one direction.
export const gateConditionSchema = z.object({
  direction: z.enum(['inbound', 'exodus']),
  status: z.enum(['open', 'light', 'moderate', 'heavy', 'hold', 'closed']),
  waitLabel: z.string().trim().max(40).optional().or(z.literal('')),
  note: z.string().trim().max(280).optional().or(z.literal('')),
})

// A location is marked by its BRC address; coordinates are geocoded server-side.
export const locationSchema = z.object({
  campId: z.string().uuid().optional(),
  artId: z.string().uuid().optional(),
  addressString: z.string().trim().min(1).max(40), // e.g. "7:30 & E"
}).refine(d => !!d.campId !== !!d.artId, {
  message: 'Provide exactly one of campId or artId',
})
