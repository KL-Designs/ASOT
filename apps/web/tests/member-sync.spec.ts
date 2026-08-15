/**
 * Member Sync tab — report + apply routes.
 *
 * DISCORD_BOT_TOKEN is deliberately '' in this test environment (see
 * tests/README.md), so `fetchAllGuildMembers()` inside
 * computeMemberSyncReport() always throws once past the auth check — same
 * situation as the existing `/api/dev/grant-all-roles` route. These specs
 * therefore cover the permission gate only: anonymous/forbidden/authorized.
 * UI behaviour (which needs real report data) is covered separately in this
 * file using page.route() to stub the client-side fetch — see the "Member
 * Sync tab UI" describe block added in later tasks.
 */
import { test, expect } from './fixtures/asot'

test.describe('GET /api/admin/orbat/member-sync', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.get('/api/admin/orbat/member-sync')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.get('/api/admin/orbat/member-sync')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        // It will fail downstream (no DISCORD_BOT_TOKEN in the test env), but
        // the authorisation decision has already been made by then — the
        // point of this test is that it is not a 403.
        const res = await adminPage.request.get('/api/admin/orbat/member-sync')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('POST /api/admin/orbat/member-sync/apply', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.post('/api/admin/orbat/member-sync/apply')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.post('/api/admin/orbat/member-sync/apply')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.post('/api/admin/orbat/member-sync/apply', { data: {} })
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('Member Sync tab UI', () => {
    const SAMPLE_REPORT = {
        onRoster: [
            {
                userId: 'u1', name: 'Red Member', avatarURL: '', onRoster: true, status: 'red',
                discord: { missing: [{ id: 'd1', name: 'J4 - Administration', source: 'Department: J4 base role' }], extra: [] },
                teamspeak: { missing: [], extra: [], linked: true },
            },
            {
                userId: 'u2', name: 'Orange Member', avatarURL: '', onRoster: true, status: 'orange',
                discord: { missing: [], extra: [{ id: 'd2', name: 'Old Role', source: 'Not expected from any current department or ORBAT role' }] },
                teamspeak: { missing: [], extra: [], linked: true },
            },
            {
                userId: 'u3', name: 'Green Member', avatarURL: '', onRoster: true, status: 'green',
                discord: { missing: [], extra: [] },
                teamspeak: { missing: [], extra: [], linked: false },
            },
        ],
        offRoster: [
            {
                userId: 'u4', name: 'Stray Member', avatarURL: '', onRoster: false, status: 'orange',
                discord: { missing: [], extra: [{ id: 'd3', name: 'Leftover Role', source: 'Not expected from any current department or ORBAT role' }] },
                teamspeak: { missing: [], extra: [], linked: true },
            },
        ],
        tsAvailable: true,
    }

    test('renders status pills and expands to show missing/extra details', async ({ adminPage }) => {
        await adminPage.route('**/api/admin/orbat/member-sync', route => route.fulfill({ json: SAMPLE_REPORT }))

        await adminPage.goto('/dashboard/orbat')
        await adminPage.getByRole('button', { name: 'Manage Roles' }).click()
        await adminPage.getByRole('button', { name: 'Member Sync' }).click()

        await expect(adminPage.getByText('Red Member')).toBeVisible()
        await expect(adminPage.getByText('Missing (1)')).toBeVisible()
        await expect(adminPage.getByText('Orange Member')).toBeVisible()
        // "Extra (1)" also appears on the off-roster "Stray Member" row, which
        // is present in the DOM (inside a collapsed MUI Collapse) but not yet
        // shown — .first() picks the on-roster (visible) instance, since
        // on-roster rows render before the off-roster section in DOM order.
        await expect(adminPage.getByText('Extra (1)').first()).toBeVisible()
        await expect(adminPage.getByText('Green Member')).toBeVisible()
        await expect(adminPage.getByText('TeamSpeak not linked')).toBeVisible()

        // On-roster count and off-roster summary
        await expect(adminPage.getByText('On Roster (3)')).toBeVisible()
        await expect(adminPage.getByText('1 member(s) with stray grants')).toBeVisible()
        await expect(adminPage.getByText('Stray Member')).not.toBeVisible()

        // Expand the red member's row
        await adminPage.getByText('Red Member').click()
        await expect(adminPage.getByText('J4 - Administration', { exact: false })).toBeVisible()
        await expect(adminPage.getByText('Department: J4 base role', { exact: false })).toBeVisible()

        // Expand off-roster
        await adminPage.getByRole('button', { name: 'Show' }).click()
        await expect(adminPage.getByText('Stray Member')).toBeVisible()
    })

    test('per-member Sync opens a confirmation dialog showing the diff, then applies and reloads', async ({ adminPage }) => {
        let getCalls = 0
        await adminPage.route('**/api/admin/orbat/member-sync', route => {
            getCalls++
            route.fulfill({ json: SAMPLE_REPORT })
        })
        let applyBody: unknown = null
        await adminPage.route('**/api/admin/orbat/member-sync/apply', async route => {
            applyBody = route.request().postDataJSON()
            await route.fulfill({ json: { membersChecked: 1, discordGranted: 1, discordRevoked: 0, tsGranted: 0, tsRevoked: 0 } })
        })

        await adminPage.goto('/dashboard/orbat')
        await adminPage.getByRole('button', { name: 'Manage Roles' }).click()
        await adminPage.getByRole('button', { name: 'Member Sync' }).click()

        // Rows aren't semantic <tr>s. Multiple ancestor divs contain "Red Member"
        // (the row wrapper, the header row, the list container...) — .last() picks
        // the innermost one (the row's own flex header), which is the only div that
        // contains Red Member's Sync button but not Orange Member's.
        const redRow = adminPage.locator('div', { hasText: 'Red Member' }).last()
        await redRow.getByRole('button', { name: 'Sync' }).click()

        await expect(adminPage.getByText('Sync Red Member?')).toBeVisible()
        await expect(adminPage.getByText('Grant (Discord)')).toBeVisible()
        // "J4 - Administration" also appears elsewhere on the page (an ORBAT
        // role select rendered in the DOM behind the dialog) — scope to the
        // dialog itself to avoid a strict-mode ambiguity.
        const dialog = adminPage.getByRole('dialog')
        await expect(dialog.getByText('J4 - Administration', { exact: false })).toBeVisible()

        await adminPage.getByRole('button', { name: 'Confirm Sync' }).click()
        await expect(adminPage.getByText('Sync Red Member?')).not.toBeVisible()

        expect(applyBody).toEqual({ userIds: ['u1'] })
        expect(getCalls).toBeGreaterThanOrEqual(2) // initial load + reload after apply
    })

    test('a failed apply shows the error inside the still-open confirmation dialog', async ({ adminPage }) => {
        await adminPage.route('**/api/admin/orbat/member-sync', route => route.fulfill({ json: SAMPLE_REPORT }))
        await adminPage.route('**/api/admin/orbat/member-sync/apply', async route => {
            await route.fulfill({ status: 500, json: { error: 'Discord API unavailable' } })
        })

        await adminPage.goto('/dashboard/orbat')
        await adminPage.getByRole('button', { name: 'Manage Roles' }).click()
        await adminPage.getByRole('button', { name: 'Member Sync' }).click()

        const redRow = adminPage.locator('div', { hasText: 'Red Member' }).last()
        await redRow.getByRole('button', { name: 'Sync' }).click()
        await expect(adminPage.getByText('Sync Red Member?')).toBeVisible()

        await adminPage.getByRole('button', { name: 'Confirm Sync' }).click()

        // Dialog must stay open (apply failed, confirmTarget is only cleared
        // on success) and the error must be visible inside it, not just in
        // the page-level Alert the dialog's own backdrop would cover.
        const dialog = adminPage.getByRole('dialog')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText('Discord API unavailable')).toBeVisible()
    })

    test('Sync All is disabled when nothing is out of sync', async ({ adminPage }) => {
        const ALL_GREEN = { onRoster: [SAMPLE_REPORT.onRoster[2]], offRoster: [], tsAvailable: true }
        await adminPage.route('**/api/admin/orbat/member-sync', route => route.fulfill({ json: ALL_GREEN }))

        await adminPage.goto('/dashboard/orbat')
        await adminPage.getByRole('button', { name: 'Manage Roles' }).click()
        await adminPage.getByRole('button', { name: 'Member Sync' }).click()

        await expect(adminPage.getByRole('button', { name: /Sync All/ })).toBeDisabled()
    })

    test('Sync All opens a confirmation dialog for every out-of-sync member, then applies and reloads', async ({ adminPage }) => {
        let getCalls = 0
        await adminPage.route('**/api/admin/orbat/member-sync', route => {
            getCalls++
            route.fulfill({ json: SAMPLE_REPORT })
        })
        let applyBody: unknown = null
        await adminPage.route('**/api/admin/orbat/member-sync/apply', async route => {
            applyBody = route.request().postDataJSON()
            await route.fulfill({
                json: { membersChecked: 3, discordGranted: 1, discordRevoked: 2, discordFailed: 0, tsGranted: 0, tsRevoked: 0, tsFailed: 0 },
            })
        })

        await adminPage.goto('/dashboard/orbat')
        await adminPage.getByRole('button', { name: 'Manage Roles' }).click()
        await adminPage.getByRole('button', { name: 'Member Sync' }).click()

        // Sync All targets every out-of-sync entry, on-roster AND off-roster —
        // SAMPLE_REPORT has 3: Red Member (u1), Orange Member (u2), and the
        // off-roster Stray Member (u4), so the dialog covers all 3, not just
        // the 2 on-roster ones.
        await adminPage.getByRole('button', { name: /Sync All/ }).click()

        await expect(adminPage.getByText('Sync 3 member(s)?')).toBeVisible()
        const dialog = adminPage.getByRole('dialog')
        await expect(dialog.getByText('Red Member')).toBeVisible()
        await expect(dialog.getByText('Orange Member')).toBeVisible()

        await adminPage.getByRole('button', { name: 'Confirm Sync' }).click()
        await expect(adminPage.getByText('Sync 3 member(s)?')).not.toBeVisible()

        expect(applyBody).toEqual({})
        expect(getCalls).toBeGreaterThanOrEqual(2) // initial load + reload after apply
    })
})
