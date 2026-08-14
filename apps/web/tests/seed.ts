/**
 * Seeds the in-memory Mongo with the fixture data the dashboard specs need.
 *
 * Why this exists at all: the dashboard gate is enforced in a *server*
 * component (`app/dashboard/layout.tsx`), so Playwright's `page.route()` —
 * which only intercepts requests the browser makes — cannot stub it. The only
 * way to exercise the real gate is to give the server a real database to
 * resolve the session against.
 *
 * That turns out to be cheap, because `client.fetchMe()` never calls Discord:
 * it reads the `token` cookie, then `Db.users` + `Db.roles`
 * (`lib/discord/index.ts`). So a seeded user plus a cookie is a complete,
 * fully-authenticated session — no OAuth, no bot token, no live Discord.
 */
import { MongoClient, ObjectId } from 'mongodb'
import { MONGO_URI, MONGO_DB, ROLE_IDS, ROLE_NAMES, USERS } from './constants'

/** Fills the many non-optional cosmetic fields on `User` that no gate reads. */
function buildUser(opts: {
    id: string
    token: string
    name: string
    roles: string[]
    departments?: string[]
    departmentRoleIds?: ObjectId[]
    discharged?: boolean
}): Record<string, unknown> {
    return {
        _id: opts.id,
        id: opts.id,
        token: opts.token,
        name: opts.name,
        hexAccentColor: '#000000',
        accentColor: 0,
        avatar: null,
        avatarURL: '',
        banner: null,
        bannerURL: null,
        globalName: opts.name,
        tag: `${opts.name}#0001`,
        username: opts.name.toLowerCase().replace(/\s+/g, '_'),
        guild: {
            nickname: opts.name,
            avatar: '',
            avatarURL: '',
            displayName: opts.name,
            joinedTimestamp: 1_700_000_000_000,
            roles: opts.roles,
        },
        departments: opts.departments ?? [],
        departmentRoleIds: opts.departmentRoleIds ?? [],
        ...(opts.discharged
            ? {
                  discharged: {
                      date: '2026-01-01',
                      type: 'honorable',
                      reason: 'E2E fixture',
                      dischargedById: '0',
                      dischargedByName: 'E2E',
                      approvedById: '0',
                      approvedByName: 'E2E',
                  },
              }
            : {}),
    }
}

/** Stable ObjectIds so re-seeding is idempotent. */
export const DEPT_ROLE_IDS = {
    j4Base: new ObjectId('0000000000000000000000a4'),
    j3Base: new ObjectId('0000000000000000000000a3'),
}

export async function seedDatabase(): Promise<void> {
    const client = new MongoClient(MONGO_URI)
    await client.connect()
    const db = client.db(MONGO_DB)

    try {
        // Wipe first so a re-run never inherits state from the last one.
        await Promise.all([
            db.collection('users').deleteMany({}),
            db.collection('roles').deleteMany({}),
            db.collection('department_roles').deleteMany({}),
            db.collection('orbat_positions').deleteMany({}),
            db.collection('orbat_roles').deleteMany({}),
            db.collection('site_settings').deleteMany({}),
            db.collection('action_logs').deleteMany({}),
        ])

        // ── Discord roles ────────────────────────────────────────────────────
        await db.collection('roles').insertMany(
            Object.entries(ROLE_NAMES).map(([id, name], i) => ({
                id,
                name,
                color: 0,
                rawPosition: i,
            })),
        )

        // ── Base department roles ────────────────────────────────────────────
        // `isBase: true` + `User.departments` membership is what actually
        // opens /dashboard now — hasDashboardAccess() checks that directly,
        // NOT any permission key (not the `ASOT Member` Discord role either).
        // `pages.dashboard` is still listed below for realism — it's what the
        // Roles Manager would show a real base role holding — but it's dead
        // weight for the dashboard gate specifically; only `departmentLeads.jX`
        // is actually consulted by hasPermission() for these two roles.
        await db.collection('department_roles').insertMany([
            {
                _id: DEPT_ROLE_IDS.j4Base,
                department: 'j4',
                name: 'J4 Base',
                isBase: true,
                discordRoleIds: [ROLE_IDS.j4DepartmentName],
                tsGroupIds: [],
                permissions: ['pages.dashboard', 'departmentLeads.j4'],
                linkedSlot: null,
                createdAt: new Date('2026-01-01'),
                createdBy: '0',
                createdByName: 'E2E',
            },
            {
                _id: DEPT_ROLE_IDS.j3Base,
                department: 'j3',
                name: 'J3 Base',
                isBase: true,
                discordRoleIds: [ROLE_IDS.j3Training],
                tsGroupIds: [],
                permissions: ['pages.dashboard'],
                linkedSlot: null,
                createdAt: new Date('2026-01-01'),
                createdBy: '0',
                createdByName: 'E2E',
            },
        ] as never)

        // ── Users ────────────────────────────────────────────────────────────
        await db.collection('users').insertMany([
            // Deliberately holds NO Discord roles and NO department. Everything
            // it can reach, it reaches purely through the OVERRIDE env var.
            buildUser({ ...USERS.override, roles: [] }),

            buildUser({
                ...USERS.j4,
                roles: [ROLE_IDS.asotMember, ROLE_IDS.j4BypassName, ROLE_IDS.j4DepartmentName],
                departments: ['j4'],
            }),

            buildUser({
                ...USERS.j3,
                roles: [ROLE_IDS.asotMember, ROLE_IDS.j3Training],
                departments: ['j3'],
            }),

            // Has `ASOT Member` but no department -> fails hasDashboardAccess().
            buildUser({ ...USERS.plainMember, roles: [ROLE_IDS.asotMember] }),

            buildUser({
                ...USERS.discharged,
                roles: [ROLE_IDS.asotMember, ROLE_IDS.j4BypassName],
                departments: ['j4'],
                discharged: true,
            }),
        ] as never)
    } finally {
        await client.close()
    }
}

/** Direct DB handle for specs that need to assert on writes (dev-mode toggles,
 *  action logs) or reset state between tests. */
export async function withDb<T>(fn: (db: import('mongodb').Db) => Promise<T>): Promise<T> {
    const client = new MongoClient(MONGO_URI)
    await client.connect()
    try {
        return await fn(client.db(MONGO_DB))
    } finally {
        await client.close()
    }
}
