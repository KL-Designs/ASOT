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
        /** /admin — departments that can access the staff dashboard */
        admin:          ['J1-Recruiting', 'J1-Staff', 'J2-Mission Making', 'J3-Training', 'J5-Media', 'J6-Game Master', 'J7-Community Development', 'HQ Staff', 'All Staff'],
        /** /members — who can view the member management list */
        members:        ['J1-Recruiting', 'J1-Staff', 'J2-Mission Making', 'J3-Training', 'J5-Media', 'HQ Staff'], // all departments + staff
        /** /operations/edit — who can access the mission editor */
        operationsEdit: ['HQ Staff', 'J2-Mission Making'],
    },

    // ── Department access (staff dashboard sidebar) ───────────────────────────

    departments: {
        /** J1 - Recruitment */
        j1: ['J1-Recruiting', 'J1-Staff'],
        /** J2 - Mission Making */
        j2: ['J2-Mission Making'],
        /** J3 - Training */
        j3: ['J3-Training'],
        /** J4 - Administration */
        j4: ['J4-Administration'],
        /** J5 - Media */
        j5: ['J5-Media'],
        /** J6 - Game Masters — role does not yet exist in Discord; add when created */
        j6: ['J6-Game Master'],
        /** J7 - Community Development — role does not yet exist in Discord; add when created */
        j7: ['J7-Community Development'],
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
        /** Restricted milpac fields: billet points, rank, enlistment date */
        editRestricted: ['J4-Administration'],
        /** Standard milpac fields: promotions, qualifications, awards, name, uploads */
        editStandard: ['HQ Staff'],
    },

    // ── Admin panel features ──────────────────────────────────────────────────

    admin: {
        /** POST /api/admin/impersonate — impersonating another user */
        impersonate:   ['J4-Administration'],
        /** Show the User Management tile in the admin panel */
        manageMembers: ['J5-Media', 'J5-Milpac Staff'],
        /** /admin/orbat — manage ORBAT structure and position assignments */
        manageOrbat:   ['HQ Staff'],
        /** ORBAT structural edits: create/rename/delete/reorder sections and roles */
        manageOrbatStructure: ['J4-Administration'],
        /** ORBAT member assignment: assign/remove users from positions, reservist management */
        manageOrbatMembers: ['HQ Staff'],
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

    // ── Attendance ────────────────────────────────────────────────────────────

    attendance: {
        /** POST /api/operations/[id]/attendance/confirm — confirm member attendance post-op */
        confirm: ['All Staff', 'HQ Staff'],
    },

    auth: {
        /** GET /api/auth/collab — collaborative editor authorization */
        collab: ['HQ Staff', 'J2-Mission Making'],
    },

    // ── Tickets ───────────────────────────────────────────────────────────────

    tickets: {
        /** PATCH /api/admin/tickets/[id] — action J3 qualification tickets */
        actionJ3: ['J3-Team Lead'],
        /** PATCH /api/admin/tickets/[id] — action J4 award tickets */
        actionJ4: ['J4-Administration'],
    },

} satisfies Record<string, Record<string, string[]>>

export default PERMISSIONS
