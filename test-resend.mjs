// One-off: confirm your Resend API key works. Throwaway — delete after testing.
//   1) add RESEND_API_KEY=re_... to .env
//   2) node test-resend.mjs
// Uses onboarding@resend.dev (Resend's shared test sender) which works BEFORE
// you verify burnermap.org and only delivers to your Resend account's email.
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('.env', import.meta.url), 'utf8')
const key = (env.match(/^RESEND_API_KEY=(.*)$/m)?.[1] ?? process.env.RESEND_API_KEY ?? '')
  .trim().replace(/^["']|["']$/g, '')
if (!key) {
  console.error('RESEND_API_KEY not found in .env — add it first.')
  process.exit(1)
}

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: 'onboarding@resend.dev',
    to: 'kennethjcarey@gmail.com',
    subject: 'Hello World',
    html: '<p>Congrats on sending your <strong>first email</strong>!</p>',
  }),
})
const data = await res.json().catch(() => ({}))
if (res.ok)
  console.log('✓ sent — check kennethjcarey@gmail.com. id:', data.id)
else
  console.error('✗ Resend error', res.status, data)
