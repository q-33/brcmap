// Import a parsed guide into the events table.
//
//   node scripts/import-events.mjs <events.json> <source-key> [--dry] [--replace]
//
// The JSON is what scripts/parse-queerburners.py (or any future parser) emits:
// [{ title, description, venue, address, startsAt, endsAt }, …]
//
// IDEMPOTENT. A guide gets revised — QueerBurners published theirs three days
// before gate — so re-running must not double every event. Rows are matched on
// (source, title, startsAt); matches are updated, new ones inserted, and with
// --replace anything from that source no longer in the file is deleted.
//
// Never touches events from another source. 'user' events are what camps posted
// themselves and are not importable — passing that key is refused.
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const [file, source, ...flags] = process.argv.slice(2)
if (!file || !source) {
  console.error('usage: node scripts/import-events.mjs <events.json> <source-key> [--dry] [--replace]')
  process.exit(1)
}
if (source === 'user') {
  console.error('refusing: "user" is what people posted themselves, not an import target')
  process.exit(1)
}
const dry = flags.includes('--dry')
const replace = flags.includes('--replace')

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const rows = JSON.parse(readFileSync(file, 'utf8'))
const clean = rows
  .filter(r => r.title && r.startsAt)
  .map(r => ({
    title: String(r.title).trim().slice(0, 200),
    description: (r.description || '').trim() || null,
    venue: (r.venue || '').trim() || null,
    venueAddress: (r.address || '').trim() || null,
    startsAt: r.startsAt,
    endsAt: r.endsAt || null,
  }))

// Same title at the same minute twice in one guide is a duplicate, not two events.
const seen = new Set()
const deduped = clean.filter((r) => {
  const k = `${r.title} ${r.startsAt}`
  if (seen.has(k))
    return false
  seen.add(k)
  return true
})

console.log(`${rows.length} parsed → ${deduped.length} after cleaning (${clean.length - deduped.length} duplicates dropped)`)
if (dry) {
  console.log('DRY RUN — nothing written. First three:')
  for (const r of deduped.slice(0, 3)) console.log(' ', JSON.stringify(r))
  process.exit(0)
}

const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 1 })
try {
  // Match on the wall-clock string, not the Date. postgres.js returns starts_at
  // as a JS Date, and stringifying that never equals the 'YYYY-MM-DD HH:MM:SS'
  // in the file — so every row missed, an update became delete-then-insert, and
  // every id churned on each run.
  const existing = await sql`
    select id, title, to_char(starts_at, 'YYYY-MM-DD HH24:MI:SS') as starts_key
    from events where source = ${source}`
  const byKey = new Map(existing.map(e => [`${e.title} ${e.starts_key}`, e.id]))
  let inserted = 0
  let updated = 0
  const keep = new Set()

  for (const r of deduped) {
    const key = `${r.title} ${r.startsAt}`
    const id = byKey.get(key)
    if (id) {
      keep.add(id)
      await sql`update events set description = ${r.description}, venue = ${r.venue},
                venue_address = ${r.venueAddress},
                ends_at = ${r.endsAt}::text::timestamp, updated_at = now()
                where id = ${id}`
      updated++
    }
    else {
      const [ins] = await sql`
        insert into events (title, description, starts_at, ends_at, source, venue, venue_address)
        values (${r.title}, ${r.description}, ${r.startsAt}::text::timestamp,
                ${r.endsAt}::text::timestamp, ${source}, ${r.venue}, ${r.venueAddress})
        returning id`
      keep.add(ins.id)
      inserted++
    }
  }

  let removed = 0
  if (replace) {
    const stale = existing.filter(e => !keep.has(e.id)).map(e => e.id)
    if (stale.length) {
      await sql`delete from events where id = any(${stale})`
      removed = stale.length
    }
  }

  const [{ n }] = await sql`select count(*)::int as n from events where source = ${source}`
  console.log(`inserted ${inserted}, updated ${updated}, removed ${removed} → ${n} events now under "${source}"`)
}
finally {
  await sql.end()
}
