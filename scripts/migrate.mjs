// Apply db/migrations/*.sql in filename order against DATABASE_URL.
// Every migration is written idempotently (create ... if not exists, add column
// if not exists, drop trigger if exists), so re-running is safe. Each file runs
// inside a transaction so a partial failure rolls back.
//
//   DATABASE_URL=postgres://… node scripts/migrate.mjs
//
// Reads DATABASE_URL from the environment (or a local .env via --env-file).

import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')
const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()

const sql = postgres(url, { prepare: false, max: 1 })
try {
  for (const file of files) {
    const ddl = await readFile(join(dir, file), 'utf8')
    process.stdout.write(`→ ${file} … `)
    await sql.begin(tx => tx.unsafe(ddl))
    console.log('ok')
  }
  console.log(`\nApplied ${files.length} migration(s).`)
}
catch (err) {
  console.error('\nMigration failed:', err.message)
  process.exitCode = 1
}
finally {
  await sql.end()
}
