// List the Tempest stations the API key can see, so the numeric station_id can
// go into lib/weather/stations.ts.
//
//   node scripts/tempest-stations.mjs
//
// Reads TEMPEST_API_KEY from .env. Prints ids and names only — never the key.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const key = env.TEMPEST_API_KEY
if (!key) {
  console.error('TEMPEST_API_KEY is not in .env yet.')
  process.exit(1)
}
const r = await fetch(`https://swd.weatherflow.com/swd/rest/stations?api_key=${encodeURIComponent(key)}`)
if (!r.ok) {
  console.error(`Tempest replied ${r.status} ${r.statusText}`)
  process.exit(1)
}
const j = await r.json()
const stations = j.stations ?? []
if (!stations.length) {
  console.log('The key is valid but sees no stations yet.')
  process.exit(0)
}
console.log(`${stations.length} station(s):\n`)
for (const s of stations) {
  console.log(`  station_id : ${s.station_id}`)
  console.log(`  name       : ${s.name}${s.public_name && s.public_name !== s.name ? `  (public: ${s.public_name})` : ''}`)
  console.log(`  location   : ${s.latitude ?? '?'}, ${s.longitude ?? '?'}`)
  console.log(`  devices    : ${(s.devices ?? []).map(d => d.device_type).join(', ') || '—'}`)
  console.log()
}
console.log('Put station_id into lib/weather/stations.ts.')
