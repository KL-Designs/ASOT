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
        admin:          ['J1-Recruiting', 'J1-Staff', 'J2-Mission Making', 'J3-Training', 'J5-Media', 'HQ Staff'], // All departments + all staff + hq
        /** /members — who can view the member management list */
        members:        ['J1-Recruiting', 'J1-Staff', 'J2-Mission Making', 'J3-Training', 'J5-Media', 'HQ Staff'], // all departments + staff
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
        edit: ['J5-Media', 'J5-Milpac Staff'],
    },

    // ── Admin panel features ──────────────────────────────────────────────────

    admin: {
        /** POST /api/admin/impersonate — impersonating another user */
        impersonate:   ['J4-Administration'],
        /** Show the User Management tile in the admin panel */
        manageMembers: ['J5-Media', 'J5-Milpac Staff'],
        /** /admin/orbat — manage ORBAT structure and position assignments */
        manageOrbat:   ['HQ Staff'],
        /** Mass Import — wipe and replace all milpac/ORBAT data from CSVs */
        massImport:    ['J4-Administration'],
    },

    // ── Optionals ─────────────────────────────────────────────────────────────

    optionals: {
        /** POST /optionals/manage — add or remove mods from the master lists */
        manage: ['J4-Administration'],
    },

    // ── Gallery ───────────────────────────────────────────────────────────────

    gallery: {
        /** /admin/gallery — manage gallery structure, upload and delete images */
        manage: ['J5-Media'],
    },

    // ── Auth / integrations ───────────────────────────────────────────────────

    auth: {
        /** GET /api/auth/collab — collaborative editor authorization */
        collab: ['HQ Staff', 'J2-Mission Making'],
    },

} satisfies Record<string, Record<string, string[]>>

export default PERMISSIONS
