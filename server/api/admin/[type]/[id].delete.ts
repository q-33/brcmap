import { adminDeleteContent } from '../../../utils/adminContent'

// Admin: delete a camp / art / event. `type` is one of camps | art | events.
//
// NOTE: this does NOT catch every type. A literal directory beside it wins the
// route, so /api/admin/camps/* and /api/admin/art/* resolve to their own files.
// Those import the same helper — see server/utils/adminContent.ts.
export default defineEventHandler(event =>
  adminDeleteContent(
    event,
    getRouterParam(event, 'type') as 'camps' | 'art' | 'events',
    getRouterParam(event, 'id'),
  ),
)
