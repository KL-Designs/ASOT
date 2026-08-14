/**
 * Who can see what.
 *
 * The sidebar is a pure projection of the `permissions` object built in
 * `app/dashboard/layout.tsx`, and gated-out items are removed from the DOM
 * entirely (`visibleItems.filter(...)`, and a section with zero visible items
 * renders `null`). That makes count assertions exact: 0 means "the gate
 * refused", not "it's off-screen".
 */
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures/asot'

/**
 * Sidebar items are matched by href, not by accessible name.
 *
 * Two reasons the name-based approach doesn't hold here:
 *  - every NavRow link starts with a `▸` active-indicator glyph *inside* the
 *    anchor, so the accessible name is "▸ Calendar", not "Calendar";
 *  - `/dashboard/tasks` is rendered twice (once by `TasksShortcutButton`,
 *    once by the Unit section), so a name match is not 1:1 with a nav item.
 *
 * Hrefs are stable, unique per destination, and immune to both.
 */
function navLink(page: Page, href: string) {
    return page.locator(`a[href="${href}"]`)
}

/** Gate semantics: a refused item is absent from the DOM entirely. */
async function expectNavVisible(page: Page, href: string, label: string) {
    await expect(navLink(page, href).first(), `${label} should be reachable`).toBeVisible()
}

async function expectNavAbsent(page: Page, href: string, label: string) {
    await expect(navLink(page, href), `${label} must not be rendered`).toHaveCount(0)
}

const DEPT_HREFS = {
    j1: '/dashboard/j1',
    j2: '/dashboard/j2',
    j3: '/dashboard/j3',
    j4: '/dashboard/j4',
    j5: '/dashboard/j5',
    j6: '/dashboard/j6',
    j7: '/dashboard/j7',
} as const

test.describe('Layout gate', () => {

    test('anonymous visitor is redirected to /login', async ({ page }) => {
        await page.goto('/dashboard')
        await expect(page).toHaveURL(/\/login/)
    })

    test('a discharged member is treated as unauthenticated', async ({ pageAs }) => {
        // fetchMember() throws on any truthy `discharged` field, so the
        // layout's `.catch(() => null)` turns it into a /login redirect —
        // even though the account still holds J4 roles in the DB.
        const page = await pageAs('discharged')
        await page.goto('/dashboard')
        await expect(page).toHaveURL(/\/login/)
    })

    test('holding "ASOT Member" alone is NOT enough to enter the dashboard', async ({ pageAs }) => {
        // Regression guard for the permission-system migration: the dashboard
        // gate is hasDashboardAccess() — implicit for department membership,
        // a department sub-role, or an ORBAT position, NOT the legacy
        // PERMISSIONS.pages.member/pages.dashboard Discord-role array (dead
        // code now, kept only for the Permissions Explorer's display).
        // A user with only the Discord role must be bounced to /me.
        const page = await pageAs('plainMember')
        await page.goto('/dashboard')
        await expect(page).toHaveURL(/\/me/)
    })

    test('department membership grants entry', async ({ memberPage }) => {
        await memberPage.goto('/dashboard')
        await expect(memberPage).toHaveURL(/\/dashboard\/?$/)
    })
})

test.describe('Sidebar visibility', () => {

    test('OVERRIDE user sees all seven departments despite holding no Discord roles', async ({ adminPage }) => {
        // The override persona's `guild.roles` is deliberately empty. Anything
        // it can see, it sees purely because its Discord ID is in OVERRIDE.
        await adminPage.goto('/dashboard')

        for (const [dept, href] of Object.entries(DEPT_HREFS)) {
            await expectNavVisible(adminPage, href, dept.toUpperCase())
        }
    })

    test('a J3 member sees only their own department', async ({ memberPage }) => {
        await memberPage.goto('/dashboard')

        await expectNavVisible(memberPage, DEPT_HREFS.j3, 'J3')

        for (const [dept, href] of Object.entries(DEPT_HREFS)) {
            if (dept === 'j3') continue
            await expectNavAbsent(memberPage, href, dept.toUpperCase())
        }
    })

    test('ORBAT is hidden from non-J4 staff', async ({ memberPage }) => {
        // admin.manageOrbat is ['J4 - Administration'] only.
        await memberPage.goto('/dashboard')
        await expectNavAbsent(memberPage, '/dashboard/orbat', 'ORBAT')
    })

    test('ORBAT is visible to the OVERRIDE user', async ({ adminPage }) => {
        await adminPage.goto('/dashboard')
        await expectNavVisible(adminPage, '/dashboard/orbat', 'ORBAT')
    })

    test('J3 counts as staff, so staff-only links appear', async ({ memberPage }) => {
        // 'J3 - Training' is in PERMISSIONS.pages.admin, so isStaff is true.
        await memberPage.goto('/dashboard')
        await expectNavVisible(memberPage, '/dashboard/unit/allstaff-calendar', 'Staff Calendar')
        await expectNavVisible(memberPage, '/dashboard/tasks', 'Tasks')
    })

    test('the isStaff flag holds for a second staff persona', async ({ pageAs }) => {
        // Both J3 and J4 roles are in PERMISSIONS.pages.admin. Asserting the
        // positive case twice guards against the flag being satisfied by
        // something incidental to the J3 persona.
        const page = await pageAs('j4')
        await page.goto('/dashboard')
        await expectNavVisible(page, '/dashboard/tasks', 'Tasks')
    })

    test('member-level links are visible to every dashboard user', async ({ memberPage }) => {
        await memberPage.goto('/dashboard')
        for (const [href, label] of [
            ['/dashboard/unit/calendar', 'Calendar'],
            ['/dashboard/unit/training-hub', 'Training Hub'],
            ['/dashboard/unit/sops', 'SOPs'],
        ] as const) {
            await expectNavVisible(memberPage, href, label)
        }
    })
})

test.describe('Direct navigation to gated department pages', () => {

    /**
     * Worth knowing how this gate actually presents: `/dashboard/j4` opts into
     * dynamic rendering (`await connection()`), so Next streams the route's
     * `loading.tsx` shell with a 200 **before** the gate resolves, and the
     * `redirect('/dashboard')` then lands as a client transition. So the
     * initial response is 200 at the gated URL and only the settled URL tells
     * you whether access was refused — hence `toHaveURL`, which retries,
     * rather than an assertion on `goto()`'s response.
     *
     * No J4 data is in that first response — it is the loading skeleton only.
     */
    test('a J3 member hitting /dashboard/j4 is redirected back to the dashboard', async ({ memberPage }) => {
        await memberPage.goto('/dashboard/j4')
        await expect(memberPage).toHaveURL(/\/dashboard$/)
    })

    test('the J4 panel does stay put for a J4 member', async ({ pageAs }) => {
        // Positive control: proves the assertion above is detecting the gate
        // and not just a slow load that never settles anywhere.
        const page = await pageAs('j4')
        await page.goto('/dashboard/j4')
        await expect(page).toHaveURL(/\/dashboard\/j4$/)
    })
})
