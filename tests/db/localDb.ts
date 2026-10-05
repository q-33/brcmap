import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '../../server/db/schema'

// A throwaway local database for tests that need real SQL. Opt-in: set
//   TEST_DATABASE_URL=postgresql://localhost/brcmap_test
// and the *.db.test.ts files run; unset, they skip. NEVER point this at .env's
// DATABASE_URL — every table is truncated first.
//
// Homebrew Postgres has no PostGIS, so the one generated geography column and
// its gist index in 0001 are stripped before applying; nothing under test
// touches them. On a PostGIS-enabled server the strip is harmless.
export const TEST_URL = process.env.TEST_DATABASE_URL

export async function freshDb() {
  const sql = postgres(TEST_URL!, { max: 1 })
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations')
  await sql.unsafe('drop schema public cascade; create schema public;')
  for (const f of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
    let text = await readFile(join(dir, f), 'utf8')
    if (f.startsWith('0001')) {
      text = text.replace('create extension if not exists postgis;', '')
        .replace(/ {2}geom geography\(Point, 4326\) generated always as \([\s\S]*?\) stored,\n/, '')
        .replace(/create index if not exists locations_geom_idx.*\n/, '')
    }
    await sql.begin(async (tx) => { await tx.unsafe(text) })
  }
  return { sql, db: drizzle(sql, { schema }) }
}
