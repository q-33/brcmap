import { adminDeleteContent } from '../../../utils/adminContent'

// Admin: delete a camp.
//
// This exists because server/api/admin/camps/ is a real directory (the
// assign-owner route lives in it), and a literal path segment beats the
// [type] catch-all next door — so /api/admin/camps/<id> never reached it and
// returned 404. Same reason for [id].patch.ts beside this file.
export default defineEventHandler(event =>
  adminDeleteContent(event, 'camps', getRouterParam(event, 'id')),
)
