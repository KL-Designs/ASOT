/**
 * Hidden / privileged functions that have no ordinary UI entry point:
 * the `/api/dev/*` back doors, impersonation, the OVERRIDE env bypass, and
 * the task-lockout force-redirect.
 *
 * Several of these are the kind of thing that is fine in dev and dangerous in
 * production, so the point of these specs is less "does it work" and more
 * "who exactly can reach it".
 */
import { test, expect } from './fixtures/asot'
import { USERS, ROLE_IDS } from './constants'
import { withDb } from './seed'

// ── /api/dev/* back doors ─────────────────────────────────────────────────────

test.describe('/api/dev back doors', () => {

    test('grant-all-roles rejects an anonymous caller', async ({ request }) => {
        expect((await request.post('/api/dev/grant-all-roles')).status()).toBe(401)
    })

    test('test-application rejects an anonymous caller', async ({ request }) => {
        expect((await request.post('/api/dev/test-application')).status()).toBe(401)
    })

    /**
     * FINDING (see tests/README.md): both `/api/dev/*` routes check only that
     * the caller is *logged in* — there is no role or permission check, and no
     * NODE_ENV guard. Any authenticated member can reach them.
     *
     * This test documents the behaviour as it stands so the gap is visible in
     * CI rather than implicit. If a permission gate is added (it should be),
     * this expectation flips to 403 and the test name should change with it.
     */
    test('test-application is reachable by ANY authenticated member — no permission gate', async ({ memberPage }) => {
        const res = await memberPage.request.post('/api/dev/test-application')

        expect(
            res.status(),
            'an ordinary J3 member was able to invoke a dev-only endpoint',
        ).not.toBe(403)
        expect(res.status()).toBe(200)
    })

    test('test-application writes a real application row for the caller', async ({ memberPage }) => {
        await withDb(db => db.collection('j1_applications').deleteMany({ discordId: USERS.j3.id }))

        const res = await memberPage.request.post('/api/dev/test-application')
        expect(res.status()).toBe(200)

        const app = await withDb(db =>
            db.collection('j1_applications').findOne({ discordId: USERS.j3.id }),
        )
        expect(app, 'dev endpoint should have created a j1_applications row').not.toBeNull()
        expect(app?.status).toBe('pending')
        expect(String(app?.inGameName)).toMatch(/^TEST_/)
    })

    test('grant-all-roles has no permission gate either', async ({ memberPage }) => {
        // It will fail downstream (no DISCORD_BOT_TOKEN in the test env), but
        // the *authorisation* decision has already been made by then — the
        // point is that it is not a 403.
        const res = await memberPage.request.post('/api/dev/grant-all-roles')
        expect(res.status()).not.toBe(403)
    })
})

// ── OVERRIDE env bypass ───────────────────────────────────────────────────────

test.describe('OVERRIDE env bypass', () => {

    test('grants full access to a user holding zero Discord roles', async ({ adminPage }) => {
        // The override persona's guild.roles is []. If OVERRIDE were not
        // honoured it would fail hasPermission('pages.member') and land on /me,
        // exactly like the plainMember persona does.
        await adminPage.goto('/dashboard/j4')
        await expect(adminPage).toHaveURL(/\/dashboard\/j4/)
    })

    test('bypasses hasPermission() as well as hasRoles()', async ({ adminPage }) => {
        // /api/admin/tasks/lockout-status gates on hasPermission('pages.member').
        const res = await adminPage.request.get('/api/admin/tasks/lockout-status')
        expect(res.status()).toBe(200)
    })

    test('a non-listed user gets no such bypass', async ({ pageAs }) => {
        const page = await pageAs('plainMember')
        await page.goto('/dashboard')
        await expect(page).toHaveURL(/\/me/)
    })
})

// ── The two differently-spelled J4 roles ──────────────────────────────────────

test.describe('J4 role-name distinction', () => {

    /**
     * `hasRoles()` hardcodes its global bypass on the role named
     * `J4-Administration` (no spaces), while `PERMISSIONS.departments.j4` is
     * `['J4 - Administration']` (with spaces). They are two different Discord
     * roles that look nearly identical in the admin UI. This pins that a user
     * holding ONLY the spaced department role still passes the J4 gate — via
     * the department array rather than the bypass.
     */
    test('the spaced department role passes the J4 department gate', async ({ pageAs }) => {
        const page = await pageAs('j4')
        expect((await page.request.get('/api/admin/discord-devmode')).status()).toBe(200)
    })

    test('a member holding neither J4 role is refused', async ({ memberPage }) => {
        expect((await memberPage.request.get('/api/admin/discord-devmode')).status()).toBe(403)
    })
})

// ── Impersonation ─────────────────────────────────────────────────────────────

test.describe('Impersonation', () => {

    test('rejects an anonymous caller', async ({ request }) => {
        const res = await request.post('/api/admin/impersonate', { data: { userId: USERS.j3.id } })
        expect(res.status()).toBe(401)
    })

    test('rejects a non-J4 member', async ({ memberPage }) => {
        const res = await memberPage.request.post('/api/admin/impersonate', {
            data: { userId: USERS.j4.id },
        })
        expect(res.status()).toBe(403)
    })

    test('requires a userId', async ({ adminPage }) => {
        expect((await adminPage.request.post('/api/admin/impersonate', { data: {} })).status()).toBe(400)
    })

    test('404s on an unknown target', async ({ adminPage }) => {
        const res = await adminPage.request.post('/api/admin/impersonate', {
            data: { userId: 'does-not-exist' },
        })
        expect(res.status()).toBe(404)
    })

    test('swaps the session, flags it, and can be returned from', async ({ context, adminPage }) => {
        await adminPage.goto('/dashboard')
        await expect(adminPage.getByText(`Welcome back, ${USERS.override.name}`)).toBeVisible()

        const res = await adminPage.request.post('/api/admin/impersonate', {
            data: { userId: USERS.j3.id },
        })
        expect(res.status()).toBe(200)

        // is_impersonating is deliberately NOT httpOnly so the client banner
        // can read it; original_token is httpOnly.
        const cookies = await context.cookies()
        expect(cookies.find(c => c.name === 'is_impersonating')?.value).toBe('1')
        expect(cookies.find(c => c.name === 'is_impersonating')?.httpOnly).toBe(false)
        expect(cookies.find(c => c.name === 'original_token')?.httpOnly).toBe(true)
        expect(cookies.find(c => c.name === 'token')?.value).toBe(USERS.j3.token)

        // The dashboard now renders as the impersonated member.
        await adminPage.goto('/dashboard')
        await expect(adminPage.getByText(`Welcome back, ${USERS.j3.name}`)).toBeVisible()

        // ...and returning restores the original session.
        expect((await adminPage.request.post('/api/admin/impersonate/return')).status()).toBe(200)
        await adminPage.goto('/dashboard')
        await expect(adminPage.getByText(`Welcome back, ${USERS.override.name}`)).toBeVisible()

        const after = await context.cookies()
        expect(after.find(c => c.name === 'is_impersonating')).toBeUndefined()
    })

    test('return is a no-op 400 when not impersonating', async ({ adminPage }) => {
        expect((await adminPage.request.post('/api/admin/impersonate/return')).status()).toBe(400)
    })
})

// ── Task lockout ──────────────────────────────────────────────────────────────

test.describe('Task lockout', () => {

    test.afterEach(async () => {
        await withDb(db => db.collection('tasks').deleteMany({ assignedTo: USERS.j4.id }))
    })

    test('reports unlocked when the user has no overdue tasks', async ({ pageAs }) => {
        const page = await pageAs('j4')
        const body = await (await page.request.get('/api/admin/tasks/lockout-status')).json()
        expect(body.locked).toBe(false)
    })

    test('an overdue task locks the user out and forces them to /dashboard/tasks', async ({ pageAs }) => {
        await withDb(db => db.collection('tasks').insertOne({
            assignedTo: USERS.j4.id,
            title: 'E2E overdue task',
            status: 'pending',
            type: 'general',
            dueDate: new Date('2020-01-01'),
            createdAt: new Date('2020-01-01'),
        }))

        const page = await pageAs('j4')

        // The J4 persona holds `J4-Administration`, which is in an enabled
        // DEFAULT_LOCKOUT_GROUPS entry — that membership is what arms lockout.
        const body = await (await page.request.get('/api/admin/tasks/lockout-status')).json()
        expect(body.locked).toBe(true)

        // StaffDashboardShell checks on mount and pushes the user to Tasks.
        await page.goto('/dashboard')
        await expect(page).toHaveURL(/\/dashboard\/tasks/)
    })

    test('lockout never arms for a user with no lockout-group roles', async ({ adminPage }) => {
        // The OVERRIDE persona holds no Discord roles, so myRoleNames is empty
        // and no group can match — it is structurally un-lockable.
        await withDb(db => db.collection('tasks').insertOne({
            assignedTo: USERS.override.id,
            title: 'E2E overdue task (override)',
            status: 'pending',
            type: 'general',
            dueDate: new Date('2020-01-01'),
            createdAt: new Date('2020-01-01'),
        }))

        const body = await (await adminPage.request.get('/api/admin/tasks/lockout-status')).json()
        expect(body.locked).toBe(false)

        await withDb(db => db.collection('tasks').deleteMany({ assignedTo: USERS.override.id }))
    })
})

// ── Unauthenticated probes of privileged surfaces ────────────────────────────

test.describe('Privileged API surface rejects anonymous callers', () => {

    for (const path of [
        '/api/admin/members',
        '/api/admin/orbat',
        '/api/admin/permissions/tree',
        '/api/admin/mass-import',
        '/api/me',
    ]) {
        test(`GET ${path} is not readable anonymously`, async ({ request }) => {
            const res = await request.get(path)
            expect(
                res.status(),
                `${path} returned ${res.status()} to an anonymous caller`,
            ).toBeGreaterThanOrEqual(400)
        })
    }
})

// Keeps the ROLE_IDS import meaningful if the seed shape ever drifts.
test('seeded role catalogue contains both J4 spellings', async () => {
    const roles = await withDb(db => db.collection('roles').find({}).toArray())
    const byId = new Map(roles.map(r => [r.id, r.name]))
    expect(byId.get(ROLE_IDS.j4BypassName)).toBe('J4-Administration')
    expect(byId.get(ROLE_IDS.j4DepartmentName)).toBe('J4 - Administration')
})
