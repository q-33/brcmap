// Grant (or revoke) a feature flag by email, from the command line.
//
//   node scripts/grant-feature.mjs <email> <feature> [--revoke]
//
// The admin UI (/admin → People) does the same thing; this exists for granting
// access to someone before you have them in front of you.
import { readFileSync } from 'node:fs'
import postgres from 'postgres'

const [email, feature, ...flags] = process.argv.slice(2)
if (!email || !feature) {
  console.error('usage: node scripts/grant-feature.mjs <email> <feature> [--revoke]')
  process.exit(1)
}
const revoke = flags.includes('--revoke')
const env = Object.fromEntries(readFileSync('.env', 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const sql = postgres(env.DATABASE_URL, { ssl: 'require', max: 1 })
try {
  const [u] = await sql`select id, email, display_name from users where lower(email) = ${email.toLowerCase()}`
  if (!u) {
    console.error(`no account for ${email} — they need to register first`)
    process.exit(1)
  }
  if (revoke) {
    await sql`delete from user_features where user_id = ${u.id} and feature = ${feature}`
    console.log(`revoked "${feature}" from ${u.email}`)
  }
  else {
    const has = await sql`select 1 from user_features where user_id = ${u.id} and feature = ${feature}`
    if (has.length)
      console.log(`${u.email} already has "${feature}"`)
    else {
      await sql`insert into user_features (user_id, feature) values (${u.id}, ${feature})`
      console.log(`granted "${feature}" to ${u.email} (${u.display_name ?? 'no display name'})`)
    }
  }
  const now = await sql`select feature from user_features where user_id = ${u.id}`
  console.log('features now:', now.map(r => r.feature).join(', ') || '(none)')
}
finally { await sql.end() }
