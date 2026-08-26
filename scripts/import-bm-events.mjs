// Import Burning Man's official event directory into our events table.
//
//   node scripts/import-bm-events.mjs [--year 2026] [--dry] [--replace]
//
// Reads BM_API_KEY from .env. Writes rows with source='official', so they sit
// behind the "Official Burning Man" toggle on /events and never mix with what
// camps posted here themselves.
//
// ONE ROW PER OCCURRENCE. Their model is an event with an occurrence_set — a
// workshop that runs Tuesday, Thursday and Saturday is one record with three
// times. Ours is one row per thing-happening-at-a-time, because that is what a
// day-by-day list needs. 3,412 events become about 6,500 rows.
//
// Venue: their events name a camp by THEIR uid, which our camps table knows
// nothing about, so the camp list is fetched once and used as a uid → name map.
// The result goes in `venue`, the same field the QueerBurners import uses. No
// attempt is made to match their camps to ours: their placement data has no
// coordinates and ours was dropped by the camps themselves.
//
// Idempotent on (source, title, startsAt), same as the other importers, so a
// re-run after they publish corrections updates rather than duplicates.
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const replace = args.includes('--replace')
const yearIdx = args.indexOf('--year')
const year = yearIdx >= 0 ? args[yearIdx + 1] : '2026'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

if (!env.BM_API_KEY) {
  console.error('BM_API_KEY is not in .env')
  process.exit(1)
}

async function bm(resource) {
  const r = await fetch(`https://api.burningman.org/api/${resource}?year=${year}`, {
    headers: { 'X-API-Key': env.BM_API_KEY },
  })
  if (!r.ok) {
    console.error(`Burning Man API replied ${r.status} for ${resource}`)
    process.exit(1)
  }
  const j = await r.json()
  return Array.isArray(j) ? j : (j.data ?? [])
}

const [rawEvents, rawCamps, rawArt] = await Promise.all([bm('event'), bm('camp'), bm('art')])
const campName = new Map(rawCamps.map(c => [c.uid, c.name]))
const artName = new Map(rawArt.map(a => [a.uid, a.name]))
console.log(`${rawEvents.length} events · ${rawCamps.length} camps · ${rawArt.length} artworks`)

// Their times carry an offset ("2026-09-03T16:00:00-07:00"). Our starts_at is a
// wall clock with no zone, so keep the local time they printed and drop the
// offset — the alternative converts a 4pm workshop into something else.
const wall = t => (typeof t === 'string' && t.length >= 19 ? t.slice(0, 10) + ' ' + t.slice(11, 19) : null)

const rows = []
for (const e of rawEvents) {
  const venue = e.hosted_by_camp
    ? campName.get(e.hosted_by_camp) ?? null
    : e.located_at_art
      ? artName.get(e.located_at_art) ?? null
      : (e.other_location || null)

  for (const o of e.occurrence_set ?? []) {
    const startsAt = wall(o.start_time)
    if (!startsAt)
      continue
    // print_description is the trimmed one written for the paper guide; prefer
    // it where it exists, since it is what a reader is meant to see.
    const desc = (e.print_description || e.description || '').trim()
    const type = e.event_type?.label
    rows.push({
      title: String(e.title || '').trim().slice(0, 200),
      description: [type ? `[${type}]` : '', desc].filter(Boolean).join(' ').trim() || null,
      venue,
      venueAddress: null,
      startsAt,
      endsAt: wall(o.end_time),
    })
  }
}

const seen = new Set()
const deduped = rows.filter((r) => {
  if (!r.title)
    return false
  const k = `${r.title} ${r.startsAt}`
  if (seen.has(k))
    return false
  seen.add(k)
  return true
})

console.log(`${rows.length} occurrences → ${deduped.length} after cleaning (${rows.length - deduped.length} duplicates dropped)`)
console.log(`  with a venue: ${deduped.filter(r => r.venue).length}`)
if (dry) {
  console.log('DRY RUN — nothing written. First three:')
  for (const r of deduped.slice(0, 3)) console.log(' ', JSON.stringify(r))
  process.exit(0)
}

const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 1 })
try {
  const existing = await sql`
    select id, title, to_char(starts_at, 'YYYY-MM-DD HH24:MI:SS') as starts_key
    from events where source = 'official'`
  const byKey = new Map(existing.map(e => [`${e.title} ${e.starts_key}`, e.id]))
  const keep = new Set()
  let inserted = 0
  let updated = 0

  // Batched: 6,500 individual round trips to a remote database is minutes of
  // waiting for no reason.
  const fresh = []
  for (const r of deduped) {
    const id = byKey.get(`${r.title} ${r.startsAt}`)
    if (id) {
      keep.add(id)
      updated++
    }
    else { fresh.push(r) }
  }
  // Inserted through unnest with an explicit ::timestamp cast, NOT the sql(rows)
  // helper. starts_at is a wall clock — "4pm on the playa" — and postgres.js
  // parses a date-shaped string into a JS Date and sends it as an instant, which
  // silently lands every event seven hours late. The first run of this script
  // did exactly that, turning a 4pm workshop into an 11pm one. Casting from text
  // keeps the literal time.
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500)
    const ins = await sql`
      insert into events (title, description, starts_at, ends_at, source, venue, venue_address)
      select * from unnest(
        ${chunk.map(r => r.title)}::text[],
        ${chunk.map(r => r.description)}::text[],
        ${chunk.map(r => r.startsAt)}::text[]::timestamp[],
        ${chunk.map(r => r.endsAt)}::text[]::timestamp[],
        ${chunk.map(() => 'official')}::text[],
        ${chunk.map(r => r.venue)}::text[],
        ${chunk.map(r => r.venueAddress)}::text[]
      )
      returning id`
    for (const x of ins) keep.add(x.id)
    inserted += ins.length
    process.stdout.write('.')
  }
  if (fresh.length) process.stdout.write('\n')

  let removed = 0
  if (replace) {
    const stale = existing.filter(e => !keep.has(e.id)).map(e => e.id)
    for (let i = 0; i < stale.length; i += 1000) {
      await sql`delete from events where id = any(${stale.slice(i, i + 1000)})`
      removed += Math.min(1000, stale.length - i)
    }
  }

  const [{ n }] = await sql`select count(*)::int as n from events where source = 'official'`
  console.log(`inserted ${inserted}, matched ${updated}, removed ${removed} → ${n} official events`)
}
finally {
  await sql.end()
}
