/**
 * Central permissions map.
 *
 * Each key maps a feature/route to the Discord roles that may access it.
 * To change who can access something, update the roles array here — no need
 * to hunt through pages or API routes.
 *
 * Notes:
 *  - J4-Administration always bypasses all checks (hardcoded in client.hasRoles).
 *  - The OVERRIDE env var allows specific user IDs to bypass all checks.
 *  - Role names must match the Discord guild role names exactly.
 */
const PERMISSIONS = {

    // ── Page access guards ────────────────────────────────────────────────────

    pages: {
        /** /admin — departments that can access the admin panel */
        admin:          ['J3-Training', 'J5-Media', 'J1-Recruiting'],
        /** /members — who can view the member management list */
        members:        ['J5-Media'],
        /** /operations/edit — who can access the mission editor */
        operationsEdit: ['HQ Staff', 'J2-Mission Making'],
    },

    // ── Operations ────────────────────────────────────────────────────────────

    operations: {
        /** Create, update, delete, duplicate, upload cover, edit content */
        write:             ['HQ Staff', 'J2-Mission Making'],
        /** Seeing "In Development" missions on the operations board */
        viewInDevelopment: ['HQ Staff', 'J2-Mission Making'],
    },

    // ── Uploads ───────────────────────────────────────────────────────────────

    uploads: {
        /** POST /api/uploads/bio — uploading member bio images */
        bio: ['HQ Staff'],
    },

    // ── Member management ─────────────────────────────────────────────────────

    members: {
        /** PUT /api/members/[username] — editing milpac records */
        edit: ['J5-Media'],
    },

    // ── Admin panel features ──────────────────────────────────────────────────

    admin: {
        /** POST /api/admin/impersonate — impersonating another user */
        impersonate:   ['J4-Administration'],
        /** Show the User Management tile in the admin panel */
        manageMembers: ['J5-Media'],
    },

    // ── Auth / integrations ───────────────────────────────────────────────────

    auth: {
        /** GET /api/auth/collab — collaborative editor authorization */
        collab: ['HQ Staff', 'J2-Mission Making'],
    },

} satisfies Record<string, Record<string, string[]>>

export default PERMISSIONS
