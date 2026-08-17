import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Nitro routes by file path, and a LITERAL directory beats a [param] segment
// beside it. So server/api/admin/[type]/[id].delete.ts stops serving
// /api/admin/camps/<id> the moment a server/api/admin/camps/ directory exists.
//
// That is not hypothetical: adding camps/[id]/owner.patch.ts for the assign-owner
// tool created that directory and silently 404'd camp delete AND camp hide. The
// UI kept calling the catch-all and got "Page not found".
//
// This test is the tripwire. Any admin content type that has its own directory
// must also carry its own [id].delete.ts / [id].patch.ts, because the catch-all
// can no longer reach it.
const ADMIN = dirname(fileURLToPath(import.meta.url))

// Types the client sends to /api/admin/<type>/<id>, from app/pages/admin.vue
// (toggleHidden and del) and app/pages/camps.vue (removeCamp).
const DELETABLE = ['camps', 'art', 'events'] as const
const HIDEABLE = ['camps', 'art'] as const

function shadowed(type: string): boolean {
  return existsSync(join(ADMIN, type))
}
function hasOwnRoute(type: string, verb: 'delete' | 'patch'): boolean {
  const dir = join(ADMIN, type)
  if (!existsSync(dir))
    return false
  return readdirSync(dir).includes(`[id].${verb}.ts`)
}

describe('admin content routes are reachable for every type the UI sends', () => {
  it.each(DELETABLE)('DELETE /api/admin/%s/<id> resolves', (type) => {
    // reachable either via the [type] catch-all (no literal dir) or its own file
    expect(!shadowed(type) || hasOwnRoute(type, 'delete')).toBe(true)
  })

  it.each(HIDEABLE)('PATCH /api/admin/%s/<id> resolves', (type) => {
    expect(!shadowed(type) || hasOwnRoute(type, 'patch')).toBe(true)
  })

  it('keeps the catch-all itself in place for the un-shadowed types', () => {
    const dir = join(ADMIN, '[type]')
    expect(readdirSync(dir).sort()).toEqual(['[id].delete.ts', '[id].patch.ts'])
  })

  it('camps has its own routes, since its directory shadows the catch-all', () => {
    // the regression this file exists for
    expect(shadowed('camps')).toBe(true)
    expect(hasOwnRoute('camps', 'delete')).toBe(true)
    expect(hasOwnRoute('camps', 'patch')).toBe(true)
  })
})
