// Import the Burning Man Kinky Database's event listings.
//
//   node scripts/import-kink-events.mjs [--dry] [--replace]
//
// The source is a public Notion database of camps, not of events: each camp row
// carries an "Events" column holding lines like
//
//     Mon 8/31 | 2 PM | Yum Cart
//     Tue 9/1  | 10:30 AM | Yoga
//     Fri 9/4  | 3 PM | HYDRATE & RADIATE | ELIXIR MIXER
//
// so the camp is the venue and each line becomes one of our events, under
// source='kink' behind the NSFW toggle.
//
// FINDING THE DATA. Notion's public page is a JS shell with nothing embedded,
// and its api/v3 endpoints answer only if you pass the COLLECTION id — which is
// not the page id in the URL. The page id is a `collection_view_page` block that
// merely points at the collection. Ask loadCachedPageChunk for the block first,
// read collection_id off it, then query that. Sending the page id returns 200
// with zero rows and no error, which is a convincing way to conclude the data
// is not public when it is.
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const replace = args.includes('--replace')

const SITE = 'https://sapphire-ocicat-5ac.notion.site'
const PAGE_ID = '3bf16d69-b025-80e7-ad31-faec36f807e8'
const SPACE_ID = '00c16d69-b025-81ff-83e6-00033be58bfb'
// "All - Full View by Infrastructure" — the view that lists every camp, rather
// than the filtered Play Spaces one the share link happens to open on.
const VIEW_ID = '3c016d69-b025-8089-8c71-000c876050b3'

const YEAR = 2026

async function notion(path, body) {
  const r = await fetch(`${SITE}/api/v3/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok)
    throw new Error(`Notion ${path} replied ${r.status}`)
  return r.json()
}

const chunk = await notion('loadCachedPageChunk', {
  page: { id: PAGE_ID },
  limit: 50,
  cursor: { stack: [] },
  chunkNumber: 0,
  verticalColumns: false,
})
const pageBlock = Object.values(chunk.recordMap?.block ?? [])
  .map(b => b.value?.value ?? b.value)
  .find(v => v?.collection_id)
if (!pageBlock) {
  console.error('Could not find the collection behind that page.')
  process.exit(1)
}
const COLLECTION_ID = pageBlock.collection_id

const res = await notion('queryCollection?src=initial_load', {
  source: { type: 'collection', id: COLLECTION_ID, spaceId: SPACE_ID },
  collectionView: { id: VIEW_ID, spaceId: SPACE_ID },
  loader: {
    reducers: { collection_group_results: { type: 'results', limit: 1000 } },
    searchQuery: '',
    sort: [],
    userTimeZone: 'America/Los_Angeles',
    type: 'results',
  },
})

// Notion keys columns by opaque ids; map them by the schema's display names so
// this survives them reordering or adding a column.
const collection = Object.values(res.recordMap?.collection ?? {})[0]
const schema = (collection?.value?.value ?? collection?.value)?.schema ?? {}
const byName = {}
for (const [key, def] of Object.entries(schema)) byName[def.name] = key
const KEY = { name: 'title', events: byName.Events, address: byName.Address, tags: byName.Tags }

const text = (prop) => {
  if (!Array.isArray(prop))
    return ''
  return prop.map(seg => (Array.isArray(seg) ? String(seg[0] ?? '') : '')).join('')
}

const camps = Object.values(res.recordMap?.block ?? {})
  .map(b => b.value?.value ?? b.value)
  .filter(v => v?.parent_table === 'collection')
  .map(v => ({
    name: text(v.properties?.[KEY.name]).trim(),
    events: text(v.properties?.[KEY.events]),
    address: text(v.properties?.[KEY.address]).trim(),
    tags: text(v.properties?.[KEY.tags]).trim(),
  }))

console.log(`${camps.length} camps · ${camps.filter(c => c.events.trim()).length} with event listings`)

// "Mon 8/31 | 2 PM | Title" — and the title may itself contain pipes, so split
// only on the first two.
const LINE = /^\s*(?:sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)\w*\.?\s+(\d{1,2})\/(\d{1,2})\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/i
const TIME = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\.?$/i

function toWall(month, day, timeText) {
  const t = TIME.exec(timeText.trim())
  if (!t)
    return null
  let h = Number(t[1])
  const m = Number(t[2] ?? 0)
  const ap = (t[3] ?? '').toLowerCase()
  if (ap.startsWith('p') && h !== 12)
    h += 12
  if (ap.startsWith('a') && h === 12)
    h = 0
  if (h > 23 || m > 59)
    return null
  const mm = String(Number(month)).padStart(2, '0')
  const dd = String(Number(day)).padStart(2, '0')
  return `${YEAR}-${mm}-${dd} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

const rows = []
const skipped = []
for (const c of camps) {
  for (const raw of c.events.split('\n')) {
    const line = raw.trim()
    if (!line)
      continue
    const m = LINE.exec(line)
    if (!m) {
      skipped.push(`${c.name}: ${line.slice(0, 70)}`)
      continue
    }
    // The time cell is usually one time, sometimes a range: "12 PM-3 PM".
    const [fromText, toText] = m[3].split(/\s*(?:-|–|—|to)\s*/i)
    const startsAt = toWall(m[1], m[2], fromText ?? '')
    if (!startsAt) {
      skipped.push(`${c.name}: ${line.slice(0, 70)}`)
      continue
    }
    // An end before the start has run past midnight.
    let endsAt = toText ? toWall(m[1], m[2], toText) : null
    if (endsAt && endsAt <= startsAt) {
      const d = new Date(`${endsAt.slice(0, 10)}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() + 1)
      endsAt = `${d.toISOString().slice(0, 10)}${endsAt.slice(10)}`
    }
    rows.push({
      title: m[4].replace(/\s+/g, ' ').trim().slice(0, 200),
      description: c.tags ? `Tags: ${c.tags}` : null,
      venue: c.name || null,
      venueAddress: c.address || null,
      startsAt,
      endsAt,
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

console.log(`${rows.length} listings → ${deduped.length} after dedupe (${rows.length - deduped.length} duplicates)`)
console.log(`  with a venue: ${deduped.filter(r => r.venue).length} · with an address: ${deduped.filter(r => r.venueAddress).length}`)
if (skipped.length) {
  console.log(`  unparsed lines: ${skipped.length}`)
  for (const s of skipped.slice(0, 10)) console.log(`    ${s}`)
}
if (dry) {
  console.log('DRY RUN — nothing written. First three:')
  for (const r of deduped.slice(0, 3)) console.log(' ', JSON.stringify(r))
  process.exit(0)
}

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 1 })
try {
  const existing = await sql`
    select id, title, to_char(starts_at, 'YYYY-MM-DD HH24:MI:SS') as starts_key
    from events where source = 'kink'`
  const byKey = new Map(existing.map(e => [`${e.title} ${e.starts_key}`, e.id]))
  const keep = new Set()
  const fresh = []
  let updated = 0
  for (const r of deduped) {
    const id = byKey.get(`${r.title} ${r.startsAt}`)
    if (id) {
      keep.add(id)
      updated++
    }
    else { fresh.push(r) }
  }

  // ::timestamp from text, never the sql(rows) helper: postgres.js turns a
  // date-shaped string into a Date and sends an instant, landing every event
  // seven hours off. That has bitten this codebase twice.
  let inserted = 0
  for (let i = 0; i < fresh.length; i += 500) {
    const part = fresh.slice(i, i + 500)
    const ins = await sql`
      insert into events (title, description, starts_at, ends_at, source, venue, venue_address)
      select * from unnest(
        ${part.map(r => r.title)}::text[],
        ${part.map(r => r.description)}::text[],
        ${part.map(r => r.startsAt)}::text[]::timestamp[],
        ${part.map(r => r.endsAt)}::text[]::timestamp[],
        ${part.map(() => 'kink')}::text[],
        ${part.map(r => r.venue)}::text[],
        ${part.map(r => r.venueAddress)}::text[]
      )
      returning id`
    for (const x of ins) keep.add(x.id)
    inserted += ins.length
  }

  let removed = 0
  if (replace) {
    const stale = existing.filter(e => !keep.has(e.id)).map(e => e.id)
    if (stale.length) {
      await sql`delete from events where id = any(${stale})`
      removed = stale.length
    }
  }

  const [{ n }] = await sql`select count(*)::int as n from events where source = 'kink'`
  console.log(`inserted ${inserted}, matched ${updated}, removed ${removed} → ${n} kink events`)
}
finally {
  await sql.end()
}
