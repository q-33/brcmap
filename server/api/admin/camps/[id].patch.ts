import { adminSetHidden, hiddenSchema } from '../../../utils/adminContent'

// Admin: hide / unhide a camp. See the note in [id].delete.ts for why this is
// not served by the [type] catch-all.
export default defineEventHandler(async (event) => {
  const { hidden } = await readValidatedBody(event, hiddenSchema.parse)
  return adminSetHidden(event, 'camps', getRouterParam(event, 'id'), hidden)
})
