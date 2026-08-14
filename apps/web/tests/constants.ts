/**
 * Shared constants for the E2E harness.
 *
 * These are deliberately fixed (not dynamically allocated) so that
 * `playwright.config.ts` can reference them at config-parse time — before
 * globalSetup has run. That removes any ordering dependency between
 * globalSetup (which starts mongod) and `webServer` (which needs MONGO_URI).
 */

/** Port the in-memory mongod binds to. Deliberately not 27017 so a real local
 *  Mongo dev instance can keep running alongside the suite. */
export const MONGO_PORT = 27018

/** Port the Next.js test server binds to. Not 3000, same reason. */
export const WEB_PORT = 3100

export const MONGO_URI = `mongodb://127.0.0.1:${MONGO_PORT}`
export const MONGO_DB = 'asot_e2e'
export const BASE_URL = `http://127.0.0.1:${WEB_PORT}`

/**
 * Discord role IDs seeded into `Db.roles`.
 *
 * NOTE the two distinct J4 names. `client.hasRoles()` hardcodes a global
 * bypass on the role literally named `J4-Administration` (no spaces), while
 * `PERMISSIONS.departments.j4` is `['J4 - Administration']` (with spaces).
 * They are different roles. `hidden-functions.spec.ts` pins that difference.
 */
export const ROLE_IDS = {
    asotMember:      '900',
    j4BypassName:    '901', // "J4-Administration"   — global bypass in hasRoles()
    j4DepartmentName:'902', // "J4 - Administration" — PERMISSIONS.departments.j4
    j3Training:      '903',
    allStaff:        '904',
    hqStaff:         '905',
    j5Media:         '906',
    j1Recruitment:   '907',
} as const

export const ROLE_NAMES: Record<string, string> = {
    [ROLE_IDS.asotMember]:       'ASOT Member',
    [ROLE_IDS.j4BypassName]:     'J4-Administration',
    [ROLE_IDS.j4DepartmentName]: 'J4 - Administration',
    [ROLE_IDS.j3Training]:       'J3 - Training',
    [ROLE_IDS.allStaff]:         'All Staff',
    [ROLE_IDS.hqStaff]:          'HQ Staff',
    [ROLE_IDS.j5Media]:          'J5 - Media',
    [ROLE_IDS.j1Recruitment]:    'J1 - Recruitment',
}

/**
 * Test personas. `token` is the value written to the `token` cookie —
 * `client.fetchMember()` resolves a user by `{ _id }` OR `{ token }`.
 */
export const USERS = {
    /** Discord ID listed in the OVERRIDE env var — bypasses hasRoles() AND
     *  hasPermission(). Holds no Discord roles at all, which is what makes it
     *  a clean probe for "is OVERRIDE actually wired up". */
    override: { id: '10000000000000001', token: 'e2e-token-override', name: 'E2E Override' },

    /** Holds `J4-Administration` (bypass name) + j4 department membership. */
    j4: { id: '10000000000000002', token: 'e2e-token-j4', name: 'E2E J4' },

    /** J3 department member — ordinary staff, no global bypass. */
    j3: { id: '10000000000000003', token: 'e2e-token-j3', name: 'E2E J3' },

    /** Holds the `ASOT Member` Discord role but belongs to NO department and
     *  holds no ORBAT position. Under the permission-system migration this
     *  user FAILS `hasPermission('pages.member')` and is bounced to /me,
     *  even though the legacy `PERMISSIONS.pages.member` array would pass. */
    plainMember: { id: '10000000000000004', token: 'e2e-token-plain', name: 'E2E Plain' },

    /** Discharged — `fetchMember()` throws, so every gate treats them as
     *  unauthenticated. */
    discharged: { id: '10000000000000005', token: 'e2e-token-discharged', name: 'E2E Discharged' },
} as const

export type PersonaKey = keyof typeof USERS
