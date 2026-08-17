import { adminSetHidden, hiddenSchema } from '../../../utils/adminContent'

// Admin: hide / unhide a camp or artwork (soft moderation).
//
// NOTE: this does NOT catch every type — see the note in [id].delete.ts.
export default defineEventHandler(async (event) => {
  const { hidden } = await readValidatedBody(event, hiddenSchema.parse)
  return adminSetHidden(
    event,
    getRouterParam(event, 'type') as 'camps' | 'art',
    getRouterParam(event, 'id'),
    hidden,
  )
})
