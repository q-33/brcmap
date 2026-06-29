import { boolean, check, doublePrecision, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  campId: uuid('camp_id').notNull().references(() => camps.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  startsAt: timestamp('starts_at', { mode: 'string' }).notNull(),
  endsAt: timestamp('ends_at', { mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('events_camp_idx').on(t.campId), index('events_starts_idx').on(t.startsAt), index('events_owner_idx').on(t.ownerId)])

// Mirrors db/migrations/0001_init.sql. The raw SQL migration is the source of
// truth for DDL (PostGIS generated column, triggers); this gives typed queries.

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  playaName: text('playa_name'),
  // 'user' (default) | 'tco' (theme camp organizer — create/manage own camp) |
  // 'gpe' (post gate conditions) | 'org' (BM Org — manage any camp + gate) | 'admin'
  role: text('role').notNull().default('user'),
  // Updated on each /api/me call (load + heartbeat) for the admin presence view.
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Per-user feature flags (early access to upcoming features).
export const userFeatures = pgTable('user_features', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  feature: text('feature').notNull(),
  grantedById: uuid('granted_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('user_features_user_idx').on(t.userId)])

// Moderation / admin audit log.
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  detail: text('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('audit_log_created_idx').on(t.createdAt)])

// Gate Road traffic conditions, append-only; newest row per direction is current.
export const gateConditions = pgTable('gate_conditions', {
  id: uuid('id').primaryKey().defaultRandom(),
  direction: text('direction').notNull(), // 'inbound' | 'exodus'
  status: text('status').notNull(), // open|light|moderate|heavy|hold|closed
  waitLabel: text('wait_label'),
  note: text('note'),
  updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('gate_conditions_dir_idx').on(t.direction, t.createdAt)])

// In-app 1:1 direct messages. A conversation is the set of messages between a
// given pair of users (derived, not a stored row).
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('messages_recipient_unread_idx').on(t.recipientId, t.readAt),
  index('messages_sender_idx').on(t.senderId, t.createdAt),
])

export const camps = pgTable('camps', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  year: integer('year').notNull(),
  description: text('description'),
  website: text('website'),
  url: text('url'),
  contactEmail: text('contact_email'),
  hometown: text('hometown'),
  // optional plot footprint (feet): frontage along the street, depth radial
  frontageFt: doublePrecision('frontage_ft'),
  depthFt: doublePrecision('depth_ft'),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('camps_owner_idx').on(t.ownerId), index('camps_year_idx').on(t.year)])

export const art = pgTable('art', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  artist: text('artist'), // the maker(s); shown as the byline
  year: integer('year').notNull(),
  description: text('description'),
  website: text('website'),
  url: text('url'),
  contactEmail: text('contact_email'),
  hometown: text('hometown'),
  // An open call: a prompt asking the community to contribute. Null = no call.
  call: text('call'),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('art_owner_idx').on(t.ownerId), index('art_year_idx').on(t.year)])

// Community contributions to an artwork's open call (e.g. translations).
// status: 'pending' (awaiting owner approval) | 'published' | 'hidden'.
export const artContributions = pgTable('art_contributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  artId: uuid('art_id').notNull().references(() => art.id, { onDelete: 'cascade' }),
  contributorId: uuid('contributor_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name'),
  body: text('body').notNull(),
  language: text('language'),
  mediaUrl: text('media_url'),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('art_contributions_art_idx').on(t.artId),
  index('art_contributions_status_idx').on(t.artId, t.status),
  index('art_contributions_author_idx').on(t.contributorId),
  check('art_contributions_status_chk', sql`status in ('pending', 'published', 'hidden')`),
])

// An artist's request to claim (own) an official, ownerless artwork. An admin
// approves through the site; approval sets art.ownerId = claimantId.
// status: 'pending' (awaiting review) | 'approved' | 'rejected'.
export const artClaims = pgTable('art_claims', {
  id: uuid('id').primaryKey().defaultRandom(),
  artId: uuid('art_id').notNull().references(() => art.id, { onDelete: 'cascade' }),
  claimantId: uuid('claimant_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text('message'),
  status: text('status').notNull().default('pending'),
  reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('art_claims_status_idx').on(t.status),
  index('art_claims_art_idx').on(t.artId, t.status),
  index('art_claims_claimant_idx').on(t.claimantId),
  check('art_claims_status_chk', sql`status in ('pending', 'approved', 'rejected')`),
])

// Single-use password-reset tokens (only the SHA-256 hash is stored).
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('password_reset_tokens_hash_idx').on(t.tokenHash), index('password_reset_tokens_user_idx').on(t.userId)])

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  campId: uuid('camp_id').references(() => camps.id, { onDelete: 'cascade' }),
  artId: uuid('art_id').references(() => art.id, { onDelete: 'cascade' }),
  addressString: text('address_string'),
  hour: integer('hour'),
  minute: integer('minute'),
  roadLetter: text('road_letter'),
  distanceFt: numeric('distance_ft'),
  gpsLatitude: doublePrecision('gps_latitude'),
  gpsLongitude: doublePrecision('gps_longitude'),
  // geom is a PostGIS generated column managed by the SQL migration; not mapped here.
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('locations_camp_idx').on(t.campId),
  index('locations_art_idx').on(t.artId),
  index('locations_owner_idx').on(t.ownerId),
  check('locations_one_parent', sql`(camp_id is not null and art_id is null) or (camp_id is null and art_id is not null)`),
])

// --- Relations (for db.query.* relational selects) -------------------------
export const campsRelations = relations(camps, ({ many, one }) => ({
  locations: many(locations),
  events: many(events),
  owner: one(users, { fields: [camps.ownerId], references: [users.id] }),
}))

export const eventsRelations = relations(events, ({ one }) => ({
  camp: one(camps, { fields: [events.campId], references: [camps.id] }),
}))

export const artRelations = relations(art, ({ many, one }) => ({
  locations: many(locations),
  contributions: many(artContributions),
  claims: many(artClaims),
  owner: one(users, { fields: [art.ownerId], references: [users.id] }),
}))

export const artContributionsRelations = relations(artContributions, ({ one }) => ({
  art: one(art, { fields: [artContributions.artId], references: [art.id] }),
  contributor: one(users, { fields: [artContributions.contributorId], references: [users.id] }),
}))

export const artClaimsRelations = relations(artClaims, ({ one }) => ({
  art: one(art, { fields: [artClaims.artId], references: [art.id] }),
  claimant: one(users, { fields: [artClaims.claimantId], references: [users.id] }),
  reviewer: one(users, { fields: [artClaims.reviewedById], references: [users.id] }),
}))

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(users, { fields: [auditLog.actorId], references: [users.id] }),
}))

export const gateConditionsRelations = relations(gateConditions, ({ one }) => ({
  updatedBy: one(users, { fields: [gateConditions.updatedById], references: [users.id] }),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  sender: one(users, { fields: [messages.senderId], references: [users.id], relationName: 'sentMessages' }),
  recipient: one(users, { fields: [messages.recipientId], references: [users.id], relationName: 'receivedMessages' }),
}))

export const locationsRelations = relations(locations, ({ one }) => ({
  camp: one(camps, { fields: [locations.campId], references: [camps.id] }),
  art: one(art, { fields: [locations.artId], references: [art.id] }),
}))
