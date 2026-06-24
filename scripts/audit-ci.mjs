// CI dependency-vulnerability gate. Runs `pnpm audit` and FAILS the build on any
// high/critical advisory that isn't in the reviewed allow-list below. New
// advisories therefore break CI until they're fixed or explicitly accepted here.
//
// (pnpm 8's `auditConfig.ignoreGhsas` is a no-op, so we gate in code instead.)
//
//   pnpm audit:ci      # run locally
import { execSync } from 'node:child_process'
import process from 'node:process'

// Reviewed + accepted advisories. Each MUST have a justification and ideally a
// fix plan. Keep this list short — prefer fixing the dependency.
const ALLOW = new Map([
  // Dev-only test tooling (vitest/vite) — never shipped to production.
  // Fix: upgrade to vitest 3.x.
  ['GHSA-9crc-q9x8-hgqq', 'vitest <2.1.9 — dev test runner only'],
  ['GHSA-5xrq-8626-4rwp', 'vitest <3.2.6 — dev test runner only'],
  ['GHSA-fx2h-pf6j-xcff', 'vite (via vitest) — dev only'],
])

const BLOCK = new Set(['high', 'critical'])

// `pnpm audit --json` exits non-zero when advisories exist; capture stdout regardless.
let raw = ''
try {
  raw = execSync('pnpm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}
catch (err) {
  raw = err.stdout?.toString() || ''
}

let data
try {
  data = JSON.parse(raw)
}
catch {
  console.error('audit-ci: could not parse `pnpm audit --json` output:\n', raw.slice(0, 500))
  process.exit(2)
}

const advisories = Object.values(data.advisories ?? {})
const relevant = advisories.filter(a => BLOCK.has(a.severity))
const blocking = relevant.filter(a => !ALLOW.has(a.github_advisory_id))
const allowed = relevant.filter(a => ALLOW.has(a.github_advisory_id))

for (const a of allowed)
  console.log(`· allowed: ${a.severity.padEnd(8)} ${a.module_name} (${a.github_advisory_id})`)

if (blocking.length) {
  console.error(`\n✖ ${blocking.length} new high/critical advisory(ies) — CI blocked:`)
  for (const a of blocking)
    console.error(`  ${a.severity.toUpperCase()} ${a.module_name} (${a.github_advisory_id}) — ${a.url}`)
  console.error('\nFix the dependency, or — if reviewed and accepted — add the GHSA id to ALLOW in scripts/audit-ci.mjs with a justification.')
  process.exit(1)
}

console.log(`\n✓ No new high/critical advisories (${allowed.length} reviewed + accepted).`)
