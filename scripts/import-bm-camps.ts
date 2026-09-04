// Import Burning Man's official camp placement directory onto the map.
//
//   pnpm exec vite-node scripts/import-bm-camps.ts -- [--year 2026] [--dry]
//
// TypeScript, and run through vite-node, because the whole job hinges on
// lib/brc/bmAddress.ts: their camps carry NO coordinates. A placement is three
// strings — { frontage: "7:30", intersection: "E", intersection_type: "&" } —
// and the only way onto the map is through our own geocoder. Reimplementing
// that in a .mjs script to avoid a TypeScript runner would mean two copies of
// the subtlest code in the repo, drifting apart.
//
// vite-node comes with vitest, which is already a direct devDependency, so this
// needs no extra install — but that is the reason it is available, not luck.
//
// WHY THIS IS WORTH RUNNING. We have 236 camps; the city has 1,184. Of the 174
// that appear in both, 162 of the 164 with positions on each side agree within
// 150 m — median 37 m. Our geocoder and their placement office independently
// land on the same spot, which is the evidence that the other 1,010 can be
// trusted onto the map.
//
// THE RULES, in order of how much damage breaking them does:
//
//   1. It never moves a camp. A location is written only for a camp with NO
//      location. Every camp already here was placed by a person, and a
//      placement spreadsheet does not get to overrule someone who knows where
//      they are actually camping.
//   2. It never overwrites a non-null field. Backfill fills blanks only.
//   3. It never changes `source` on an existing row. A camp that came here and
//      asked to be on the map stays 'community' forever, even if it also
//      appears in the directory.
//   4. It never guesses a pin. bmPlacement() returns `unplaceable` with a
//      reason for portals, Airport Road and blank placements; those camps are
//      inserted without a location rather than dropped somewhere plausible.
import { readFileSync } from 'node:fs'
import process from 'node:process'
import postgres from 'postgres'
import { bmAddressString, bmPlacement, bmPlacementToLatLng } from '../lib/brc/bmAddress'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const yi = args.indexOf('--year')
const year = yi >= 0 ? args[yi + 1]! : '2026'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])) as Record<string, string>

for (const k of ['BM_API_KEY', 'DATABASE_URL']) {
  if (!env[k]) {
    console.error(`${k} is not in .env`)
    process.exit(1)
  }
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

interface BmCamp {
  uid: string
  name: string
  url?: string | null
  hometown?: string | null
  description?: string | null
  location_string?: string | null
  location?: { frontage?: string | null, intersection?: string | null, intersection_type?: string | null } | null
}

const res = await fetch(`https://api.burningman.org/api/camp?year=${year}`, {
  headers: { 'X-API-Key': env.BM_API_KEY! },
})
if (!res.ok) {
  console.error(`Burning Man API replied ${res.status} for camp`)
  process.exit(1)
}
const body = await res.json() as BmCamp[] | { data: BmCamp[] }
const theirs: BmCamp[] = Array.isArray(body) ? body : (body.data ?? [])

const placed = theirs.filter(c => bmPlacementToLatLng(bmPlacement(c.location)))
console.log(`Burning Man: ${theirs.length} camps for ${year}, ${placed.length} we can place (${Math.round(placed.length / theirs.length * 100)}%)`)

const sql = postgres(env.DATABASE_URL!, { prepare: false, max: 1 })

try {
  const rows = await sql<{
    id: string, name: string, bm_uid: string | null, source: string, owner_id: string | null,
    description: string | null, url: string | null, hometown: string | null, loc_count: string,
  }[]>`
    select c.id, c.name, c.bm_uid, c.source, c.owner_id, c.description, c.url, c.hometown,
           (select count(*) from locations l where l.camp_id = c.id) as loc_count
    from camps c
    where c.year = ${Number(year)}
  `
  console.log(`ours: ${rows.length} camps, ${rows.filter(r => Number(r.loc_count) > 0).length} placed\n`)

  const byUid = new Map(rows.filter(r => r.bm_uid).map(r => [r.bm_uid!, r]))
  const byName = new Map(rows.map(r => [norm(r.name), r]))

  const link: [typeof rows[number], BmCamp][] = []
  const backfill: [typeof rows[number], Record<string, string>][] = []
  const place: [typeof rows[number], BmCamp][] = []
  const insert: BmCamp[] = []
  const skipPlaced: [typeof rows[number], BmCamp][] = []
  const unplaceable: string[] = []

  for (const c of theirs) {
    const mine = byUid.get(c.uid) ?? byName.get(norm(c.name))
    const p = bmPlacement(c.location)
    const at = bmPlacementToLatLng(p)
    if (!at)
      unplaceable.push(`${c.name} — ${p.kind === 'unplaceable' ? p.reason : 'no coordinates'}`)

    if (!mine) {
      insert.push(c)
      continue
    }
    if (!mine.bm_uid)
      link.push([mine, c])

    const fills: Record<string, string> = {}
    if (!mine.description && c.description) fills.description = c.description
    if (!mine.url && c.url) fills.url = c.url
    if (!mine.hometown && c.hometown) fills.hometown = c.hometown
    if (Object.keys(fills).length)
      backfill.push([mine, fills])

    if (Number(mine.loc_count) > 0)
      skipPlaced.push([mine, c]) // RULE 1
    else if (at)
      place.push([mine, c])
  }

  console.log(`  link to a BM uid ............ ${link.length}`)
  console.log(`  backfill blank fields ....... ${backfill.length}`)
  console.log(`  place (was unplaced) ........ ${place.length}`)
  console.log(`  insert as new (official) .... ${insert.length}`)
  console.log(`  already placed, LEFT ALONE .. ${skipPlaced.length}`)
  console.log(`  no honest pin (kept anyway) . ${unplaceable.length}`)

  if (unplaceable.length) {
    console.log('\n  why some have no pin:')
    for (const u of unplaceable.slice(0, 6))
      console.log(`      ${u}`)
    if (unplaceable.length > 6)
      console.log(`      … and ${unplaceable.length - 6} more`)
  }

  if (dry) {
    console.log('\n--dry: nothing written.')
    console.log('\nfirst 8 inserts:')
    for (const c of insert.slice(0, 8)) {
      const p = bmPlacement(c.location)
      console.log(`  ${c.name.slice(0, 40).padEnd(42)} ${bmAddressString(p) ?? '(no pin)'}`)
    }
  }
  else {
    let linked = 0; let filled = 0; let located = 0; let added = 0

    await sql.begin(async (tx) => {
      for (const [mine, c] of link) {
        await tx`update camps set bm_uid = ${c.uid} where id = ${mine.id} and bm_uid is null`
        linked++
      }
      for (const [mine, fills] of backfill) {
        await tx`update camps set ${tx(fills)}, updated_at = now() where id = ${mine.id}`
        filled++
      }
      for (const [mine, c] of place) {
        // Re-checked inside the transaction: a pin dropped by a human between
        // the read and this write still wins.
        const [exists] = await tx`select 1 from locations where camp_id = ${mine.id} limit 1`
        if (exists)
          continue
        const at = bmPlacementToLatLng(bmPlacement(c.location))!
        await tx`
          insert into locations (camp_id, address_string, gps_latitude, gps_longitude)
          values (${mine.id}, ${c.location_string ?? bmAddressString(bmPlacement(c.location))}, ${at.lat}, ${at.lng})
        `
        located++
      }
      for (const c of insert) {
        const [row] = await tx<{ id: string }[]>`
          insert into camps (name, year, description, url, hometown, source, bm_uid)
          values (${c.name}, ${Number(year)}, ${c.description ?? null}, ${c.url ?? null},
                  ${c.hometown ?? null}, 'official', ${c.uid})
          returning id
        `
        added++
        const at = bmPlacementToLatLng(bmPlacement(c.location))
        if (at && row) {
          await tx`
            insert into locations (camp_id, address_string, gps_latitude, gps_longitude)
            values (${row.id}, ${c.location_string ?? bmAddressString(bmPlacement(c.location))}, ${at.lat}, ${at.lng})
          `
          located++
        }
      }
    })

    console.log(`\nlinked ${linked}, backfilled ${filled}, placed ${located}, inserted ${added}`)
    const [tot] = await sql<{ n: number }[]>`
      select count(*)::int as n from camps c where c.year = ${Number(year)}
        and exists (select 1 from locations l where l.camp_id = c.id)
    `
    const [off] = await sql<{ n: number }[]>`select count(*)::int as n from camps where source = 'official'`
    console.log(`${tot?.n} camps on the map, ${off?.n} of them from the official directory.`)
  }
}
catch (err: any) {
  console.error('\nImport failed:', err.message)
  process.exitCode = 1
}
finally {
  await sql.end()
}
