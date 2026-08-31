/**
 * How many items the public featured rail holds.
 *
 * One number, two writers. `PUT /api/gallery/admin/featured/order` takes the
 * whole rotation and has always capped it at this; `PATCH
 * /api/gallery/admin/media/[id]` now appends one item at a time from the Media
 * tab's inspector, and a per-item toggle that did not know about the cap would
 * let a reviewer build a 61-item rail the Featured tab then refuses to save —
 * a failure that would surface on a drag, with nothing to connect it to the
 * toggle that caused it half an hour earlier.
 *
 * It lives here rather than in either route because a route file under Next's
 * `typedRoutes` may export only route handlers and the permitted config names;
 * a stray `export const` there breaks the production build while tsc, ESLint
 * and vitest all stay green.
 */
export const MAX_FEATURED = 60
