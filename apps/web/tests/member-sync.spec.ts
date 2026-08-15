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
