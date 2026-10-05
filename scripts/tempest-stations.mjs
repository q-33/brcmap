// List the Tempest stations an API key can see, so the numeric station_id can go
// into lib/weather/stations.ts.
//
//   node scripts/tempest-stations.mjs                 list everything
//   node scripts/tempest-stations.mjs ST-00200395     find the station holding
//                                                     that device serial
//
// A device (the "ST-…" serial printed on the sensor) is one piece of hardware.
// A station is the grouping it belongs to, and the API identifies that with a
// plain integer — those are the numbers our config needs. Tempest's own guidance
// is to read station observations rather than device ones, so that a station with
// two thermometers still returns the owner's designated primary.
//
// Reads TEMPEST_API_KEY from .env, or the environment if it is not there. Prints
// ids, names and positions only — never the key.
import { existsSync, readFileSync } from 'node:fs'

let key = process.env.TEMPEST_API_KEY
if (!key && existsSync('.env')) {
  const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
  key = env.TEMPEST_API_KEY
}
if (!key) {
  console.error('No TEMPEST_API_KEY found in .env or the environment.')
  console.error('Either add it to .env, or run:  TEMPEST_API_KEY=… node scripts/tempest-stations.mjs')
  process.exit(1)
}

const wanted = (process.argv[2] || '').trim().toUpperCase()

const r = await fetch(`https://swd.weatherflow.com/swd/rest/stations?api_key=${encodeURIComponent(key)}`)
if (!r.ok) {
  console.error(`Tempest replied ${r.status} ${r.statusText}`)
  process.exit(1)
}
const stations = (await r.json()).stations ?? []
if (!stations.length) {
  console.log('The key is valid but sees no stations.')
  process.exit(0)
}

// Black Rock City, to say plainly whether a station is anywhere near the playa.
// Mirrors CITY / kmFromCity / MAX_STATION_KM in lib/weather/stations.ts (the
// source of truth); copied because a plain .mjs script cannot import that module.
const CITY = { lat: 40.7864, lng: -119.2065 }
const kmFromCity = (lat, lng) => {
  if (lat == null || lng == null)
    return null
  const dy = (lat - CITY.lat) * 111.32
  const dx = (lng - CITY.lng) * 111.32 * Math.cos((CITY.lat * Math.PI) / 180)
  return Math.round(Math.hypot(dx, dy))
}

let matched = null
console.log(`${stations.length} station(s) on this key:\n`)
for (const s of stations) {
  const devices = s.devices ?? []
  const serials = devices.map(d => d.serial_number).filter(Boolean)
  const km = kmFromCity(s.latitude, s.longitude)
  const hit = wanted && serials.some(x => String(x).toUpperCase() === wanted)
  if (hit)
    matched = s

  console.log(`${hit ? '>>' : '  '} station_id : ${s.station_id}${hit ? '   <-- holds ' + wanted : ''}`)
  console.log(`   name       : ${s.name}${s.public_name && s.public_name !== s.name ? `  (public: ${s.public_name})` : ''}`)
  console.log(`   position   : ${s.latitude ?? '?'}, ${s.longitude ?? '?'}`
    + (km == null ? '' : `   — ${km} km from Black Rock City${km > 50 ? '  (OUTSIDE the 50 km limit; readings will be ignored)' : '  (on the playa)'}`))
  console.log(`   devices    : ${devices.map(d => `${d.serial_number ?? '?'} (${d.device_type ?? '?'})`).join(', ') || '—'}`)
  console.log()
}

if (wanted) {
  if (matched)
    console.log(`${wanted} belongs to station_id ${matched.station_id}. Put that in lib/weather/stations.ts.`)
  else
    console.log(`No device matching ${wanted} on this key. Check the serial, or that Radar shared the station with this account.`)
}
else {
  console.log('Put the station_id into lib/weather/stations.ts.')
}
