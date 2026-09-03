// Import Burning Man's official art directory into our art table.
//
//   node scripts/import-bm-art.mjs [--year 2026] [--dry]
//
// Reads BM_API_KEY and DATABASE_URL from .env. Run --dry first: it prints the
// exact plan and writes nothing.
//
// WHY THIS IS WORTH RUNNING. Their art records carry real GPS, which their camp
// records do not. We hold 266 artworks for 2026 and only nine of them are placed
// — the rest are names with no coordinates, which means they are in the database
// and not on the map. Their directory places 351 of them to the foot.
//
// THE RULES THIS IMPORT PLAYS BY, in order of how much damage breaking them does:
//
//   1. It never moves anything. A location row is written only for an artwork
//      that has NO location at all. Someone who dragged their own pin to where
//      the piece actually stands has better information than the placement
//      spreadsheet, and this must never argue with them.
//   2. It never overwrites a non-null field. Backfill only fills blanks, so an
//      artist's own description survives a re-import of their official listing.
//   3. It never touches art that isn't theirs. No BM uid, no name match, no
//      alias — untouched, forever.
//
// MATCHING is by their uid once known, then by normalised name, then by the
// explicit alias list below. Name matching is deliberately exact-after-
// normalisation rather than fuzzy: a fuzzy threshold that silently merges two
// different sculptures is a worse failure than one duplicate a human can spot.
// Anything the run considers a near-miss is REPORTED, not acted on.
import { readFileSync } from 'node:fs'
import process from 'node:process'
import postgres from 'postgres'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const yearIdx = args.indexOf('--year')
const year = yearIdx >= 0 ? args[yearIdx + 1] : '2026'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

for (const k of ['BM_API_KEY', 'DATABASE_URL']) {
  if (!env[k]) {
    console.error(`${k} is not in .env`)
    process.exit(1)
  }
}

// Known name drift between their directory and rows already here. Keep this
// list short and explicit — each entry is a human decision that two records are
// the same physical artwork, and it is the only thing allowed to merge rows that
// do not match by name.
//
//   "Eifella Broken Dream" — ours, placed by its artist at 8:30 & Esplanade.
//   "EIFFELA BROKEN DREAM" — theirs, placed at 8:37 1900', about 22 m away.
// One typo. Linking them keeps the artist's own pin and skips a duplicate.
const ALIASES = new Map([
  ['eifellabrokendream', 'eiffelabrokendream'],
])

const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

async function bmArt() {
  const r = await fetch(`https://api.burningman.org/api/art?year=${year}`, {
    headers: { 'X-API-Key': env.BM_API_KEY },
  })
  if (!r.ok) {
    console.error(`Burning Man API replied ${r.status} for art`)
    process.exit(1)
  }
  const j = await r.json()
  return Array.isArray(j) ? j : (j.data ?? [])
}

const theirs = await bmArt()
const placed = theirs.filter(a => a.location?.gps_latitude != null && a.location?.gps_longitude != null)
console.log(`Burning Man: ${theirs.length} artworks for ${year}, ${placed.length} with GPS`)

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 1 })

try {
  const rows = await sql`
    select a.id, a.name, a.bm_uid, a.owner_id, a.artist, a.description, a.hometown, a.url, a.website,
           (select count(*) from locations l where l.art_id = a.id) as loc_count
    from art a
    where a.year = ${Number(year)}
  `
  console.log(`ours: ${rows.length} artworks for ${year}, ${rows.filter(r => Number(r.loc_count) > 0).length} placed\n`)

  const byUid = new Map(rows.filter(r => r.bm_uid).map(r => [r.bm_uid, r]))
  const byName = new Map()
  for (const r of rows)
    byName.set(norm(r.name), r)

  const plan = { link: [], backfill: [], place: [], insert: [], skipPlaced: [], untouched: [] }

  for (const a of theirs) {
    const key = norm(a.name)
    const mine = byUid.get(a.uid)
      ?? byName.get(key)
      // alias: our normalised name maps to theirs
      ?? rows.find(r => ALIASES.get(norm(r.name)) === key)

    if (!mine) {
      plan.insert.push(a)
      continue
    }
    if (!mine.bm_uid)
      plan.link.push([mine, a])

    const fills = {}
    if (!mine.artist && a.artist) fills.artist = a.artist
    if (!mine.description && a.description) fills.description = a.description
    if (!mine.hometown && a.hometown) fills.hometown = a.hometown
    if (!mine.url && a.url) fills.url = a.url
    if (Object.keys(fills).length)
      plan.backfill.push([mine, fills])

    const gps = a.location?.gps_latitude != null && a.location?.gps_longitude != null
    if (Number(mine.loc_count) > 0)
      plan.skipPlaced.push([mine, a]) // RULE 1: never move what is already placed
    else if (gps)
      plan.place.push([mine, a])
  }

  const claimed = new Set([
    ...plan.link.map(([m]) => m.id),
    ...plan.backfill.map(([m]) => m.id),
    ...plan.skipPlaced.map(([m]) => m.id),
    ...plan.place.map(([m]) => m.id),
  ])
  plan.untouched = rows.filter(r => !claimed.has(r.id))

  console.log(`  link to a BM uid ......... ${plan.link.length}`)
  console.log(`  backfill blank fields .... ${plan.backfill.length}`)
  console.log(`  place (was unplaced) ..... ${plan.place.length}`)
  console.log(`  insert as new ............ ${plan.insert.length}`)
  console.log(`  already placed, LEFT ALONE ${plan.skipPlaced.length}`)
  console.log(`  ours, not in their list .. ${plan.untouched.length}`)

  // Symmetric near-miss report. Checked BOTH ways on purpose: a one-directional
  // pass missed the Eiffela/Eifella pair entirely, and that pair is the whole
  // reason the alias list exists.
  const ourKeys = rows.map(r => norm(r.name))
  const theirKeys = theirs.map(a => norm(a.name))
  const near = (x, pool) => pool.find(y => y !== x && (y.includes(x) || x.includes(y)) && Math.abs(x.length - y.length) <= 4)
  const suspicious = []
  for (const a of plan.insert) {
    const hit = near(norm(a.name), ourKeys)
    if (hit)
      suspicious.push(`their "${a.name}" ~ ours "${rows.find(r => norm(r.name) === hit).name}"`)
  }
  for (const r of plan.untouched) {
    const hit = near(norm(r.name), theirKeys)
    if (hit)
      suspicious.push(`ours "${r.name}" ~ their "${theirs.find(a => norm(a.name) === hit).name}"`)
  }
  if (suspicious.length) {
    console.log(`\n  ⚠ ${suspicious.length} possible duplicate(s) — add to ALIASES if they are the same piece:`)
    for (const s of suspicious)
      console.log(`      ${s}`)
  }

  if (dry) {
    console.log('\n--dry: nothing written.')
    if (plan.insert.length) {
      console.log('\nfirst 10 inserts:')
      for (const a of plan.insert.slice(0, 10))
        console.log(`  ${a.name} — ${a.artist ?? 'unknown artist'} @ ${a.location_string ?? 'no address'}`)
    }
  }
  else {
    let linked = 0; let filled = 0; let located = 0; let added = 0

    await sql.begin(async (tx) => {
      for (const [mine, a] of plan.link) {
        await tx`update art set bm_uid = ${a.uid} where id = ${mine.id} and bm_uid is null`
        linked++
      }
      for (const [mine, fills] of plan.backfill) {
        await tx`update art set ${tx(fills)}, updated_at = now() where id = ${mine.id}`
        filled++
      }
      for (const [mine, a] of plan.place) {
        // Guarded by the same condition the plan was built on, so a location added
        // by a human between the read and this write still wins.
        const [existing] = await tx`select 1 from locations where art_id = ${mine.id} limit 1`
        if (existing)
          continue
        const l = a.location
        await tx`
          insert into locations (art_id, address_string, hour, minute, distance_ft, gps_latitude, gps_longitude)
          values (${mine.id}, ${a.location_string ?? null}, ${l.hour ?? null}, ${l.minute ?? null},
                  ${l.distance ?? null}, ${l.gps_latitude}, ${l.gps_longitude})
        `
        located++
      }
      for (const a of plan.insert) {
        const [row] = await tx`
          insert into art (name, artist, year, description, hometown, url, bm_uid)
          values (${a.name}, ${a.artist ?? null}, ${Number(year)}, ${a.description ?? null},
                  ${a.hometown ?? null}, ${a.url ?? null}, ${a.uid})
          returning id
        `
        added++
        const l = a.location
        if (l?.gps_latitude != null && l?.gps_longitude != null) {
          await tx`
            insert into locations (art_id, address_string, hour, minute, distance_ft, gps_latitude, gps_longitude)
            values (${row.id}, ${a.location_string ?? null}, ${l.hour ?? null}, ${l.minute ?? null},
                    ${l.distance ?? null}, ${l.gps_latitude}, ${l.gps_longitude})
          `
          located++
        }
      }
    })

    console.log(`\nlinked ${linked}, backfilled ${filled}, placed ${located}, inserted ${added}`)
    const [{ count: onMap }] = await sql`
      select count(*)::int from art a where a.year = ${Number(year)}
        and exists (select 1 from locations l where l.art_id = a.id)
    `
    console.log(`${onMap} artworks now have a place on the map.`)
  }
}
catch (err) {
  console.error('\nImport failed:', err.message)
  process.exitCode = 1
}
finally {
  await sql.end()
}
