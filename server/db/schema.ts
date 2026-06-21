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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [index('art_owner_idx').on(t.ownerId), index('art_year_idx').on(t.year)])

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
}))

export const locationsRelations = relations(locations, ({ one }) => ({
  camp: one(camps, { fields: [locations.campId], references: [camps.id] }),
  art: one(art, { fields: [locations.artId], references: [art.id] }),
}))
