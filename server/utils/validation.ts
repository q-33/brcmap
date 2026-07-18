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

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(200),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// Public contact form → emails the project inbox.
export const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  message: z.string().trim().min(1).max(4000),
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
  artist: z.string().trim().max(200).optional(),
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

// An artist's request to claim an ownerless artwork (optional identity note).
export const artClaimSchema = z.object({
  message: z.string().trim().max(1000).optional().or(z.literal('')),
})

// Admin decision on a claim.
export const claimModerateSchema = z.object({
  status: z.enum(['approved', 'rejected']),
})

// A community contribution to an artwork's open call (logged-in users only).
export const artContributionSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  language: z.string().trim().max(80).optional().or(z.literal('')),
  // http(s) only — reject javascript:/data: URLs that .url() would otherwise allow.
  mediaUrl: z.string().url().max(500).regex(/^https?:\/\//i, 'Link must start with http:// or https://').optional().or(z.literal('')),
})

// Owner moderation: publish or hide a submitted contribution.
export const artContributionModerateSchema = z.object({
  status: z.enum(['published', 'hidden', 'pending']),
})

// Events: a camp announces a planned event. starts/ends are playa wall-clock
// strings (e.g. "2026-08-31T15:00") from a datetime-local input.
export const eventSchema = z.object({
  // optional: admins may post an "official" event with no hosting camp
  campId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).optional(),
  startsAt: z.string().min(1).max(40),
  endsAt: z.string().max(40).optional().or(z.literal('')),
}).refine(d => !d.endsAt || d.endsAt >= d.startsAt, {
  message: 'End time must be after the start time',
})

// Admin: set a user's role.
export const roleSchema = z.object({
  role: z.enum(['user', 'gpe', 'admin', 'org', 'tco', 'hubs']),
})

// Admin: set the full set of a user's granted feature flags.
export const featuresSchema = z.object({
  features: z.array(z.string().max(64)).max(50),
})

// A GPE-posted Gate Road condition for one direction.
export const gateConditionSchema = z.object({
  direction: z.enum(['inbound', 'exodus']),
  status: z.enum(['open', 'light', 'moderate', 'heavy', 'hold', 'closed']),
  waitLabel: z.string().trim().max(40).optional().or(z.literal('')),
  note: z.string().trim().max(280).optional().or(z.literal('')),
})

// Owner edits to their camp's details (not location/year).
export const campUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  contactEmail: z.string().email().optional().or(z.literal('')),
  hometown: z.string().max(200).optional().or(z.literal('')),
  frontageFt: z.number().min(0).max(3000).nullable().optional(),
  depthFt: z.number().min(0).max(3000).nullable().optional(),
})

// Admin edits to an artwork's details (e.g. fixing an entry dropped in error).
export const artUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  artist: z.string().trim().max(200).optional().or(z.literal('')),
  year: z.number().int().gte(1986).lte(2100).optional(),
  description: z.string().max(2000).optional().or(z.literal('')),
  website: z.string().url().optional().or(z.literal('')),
  contactEmail: z.string().email().optional().or(z.literal('')),
  hometown: z.string().max(200).optional().or(z.literal('')),
})

// A direct message to another registered user.
export const messageSchema = z.object({
  recipientId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
})

// A location is marked either by an exact point (lat/lng, from tapping the map —
// stored verbatim, no snapping) or by a typed BRC address (geocoded to the grid).
export const locationSchema = z.object({
  campId: z.string().uuid().optional(),
  artId: z.string().uuid().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  addressString: z.string().trim().min(1).max(40).optional(), // e.g. "7:30 & E"
}).refine(d => !!d.campId !== !!d.artId, {
  message: 'Provide exactly one of campId or artId',
}).refine(d => (d.lat != null && d.lng != null) || !!d.addressString, {
  message: 'Provide a map point (lat/lng) or an address',
})
