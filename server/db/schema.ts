import { check, doublePrecision, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
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
  // 'user' (default) | 'gpe' (can post gate conditions) | 'admin'
  role: text('role').notNull().default('user'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('camps_owner_idx').on(t.ownerId), index('camps_year_idx').on(t.year)])

export const art = pgTable('art', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  year: integer('year').notNull(),
  description: text('description'),
  website: text('website'),
  url: text('url'),
  contactEmail: text('contact_email'),
  hometown: text('hometown'),
  // An open call: a prompt asking the community to contribute. Null = no call.
  call: text('call'),
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
export const campsRelations = relations(camps, ({ many }) => ({
  locations: many(locations),
  events: many(events),
}))

export const eventsRelations = relations(events, ({ one }) => ({
  camp: one(camps, { fields: [events.campId], references: [camps.id] }),
}))

export const artRelations = relations(art, ({ many }) => ({
  locations: many(locations),
  contributions: many(artContributions),
}))

export const artContributionsRelations = relations(artContributions, ({ one }) => ({
  art: one(art, { fields: [artContributions.artId], references: [art.id] }),
  contributor: one(users, { fields: [artContributions.contributorId], references: [users.id] }),
}))

export const gateConditionsRelations = relations(gateConditions, ({ one }) => ({
  updatedBy: one(users, { fields: [gateConditions.updatedById], references: [users.id] }),
}))

export const locationsRelations = relations(locations, ({ one }) => ({
  camp: one(camps, { fields: [locations.campId], references: [camps.id] }),
  art: one(art, { fields: [locations.artId], references: [art.id] }),
}))
