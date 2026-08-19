// One-off: create the art row for "Mundara".
//
// It has a track on Burning Man's 2026 Art Audio Tour (23) but no row in our art
// table, so the track had nowhere to attach. Inserted unplaced — we have no
// location for it, and a guessed pin is worse than none.
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 1 })
try {
  const existing = await sql`select id, name, year from art where lower(name) = 'mundara'`
  if (existing.length) {
    console.log('already present:', existing[0])
  }
  else {
    const [{ y }] = await sql`select mode() within group (order by year) as y from art`
    const [row] = await sql`
      insert into art (name, year, description, hidden)
      values ('Mundara', ${y ?? 2026},
              'Featured on the 2026 Art Audio Tour (track 23). Location not yet recorded.',
              false)
      returning id, name, year`
    console.log('inserted:', row)
  }
  const [{ n }] = await sql`select count(*)::int as n from art`
  console.log('art rows now:', n)
}
finally {
  await sql.end()
}
