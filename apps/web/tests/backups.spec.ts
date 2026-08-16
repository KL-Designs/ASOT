/**
 * Backups API — restic-backed backup/revert/download/upload/config routes.
 *
 * Exercising a real backup/restore cycle needs a real restic binary and a
 * populated repo, neither of which exist in this test environment (same
 * situation as `member-sync.spec.ts`'s Discord dependency) — these specs
 * therefore cover the permission gate only: anonymous/forbidden/authorized.
 */
import { test, expect } from './fixtures/asot'

test.describe('GET /api/backups', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.get('/api/backups')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.get('/api/backups')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.get('/api/backups')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('GET /api/backups/storage', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.get('/api/backups/storage')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.get('/api/backups/storage')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.get('/api/backups/storage')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('POST /api/backups/create', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.post('/api/backups/create')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.post('/api/backups/create')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.post('/api/backups/create')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('POST /api/backups/revert', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        const res = await request.post('/api/backups/revert', { data: { id: '2026-08-16T14:00:00.000Z' } })
        expect(res.status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        const res = await memberPage.request.post('/api/backups/revert', { data: { id: '2026-08-16T14:00:00.000Z' } })
        expect(res.status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.post('/api/backups/revert', { data: { id: '2026-08-16T14:00:00.000Z' } })
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('GET /api/backups/[id]/download', () => {
    const path = '/api/backups/2026-08-16T14%3A00%3A00.000Z/download'

    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.get(path)).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.get(path)).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.get(path)
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('POST /api/backups/upload', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.post('/api/backups/upload')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.post('/api/backups/upload')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.post('/api/backups/upload')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('POST /api/backups/cancel', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.post('/api/backups/cancel')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.post('/api/backups/cancel')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.post('/api/backups/cancel')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('GET /api/backups/config', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.get('/api/backups/config')).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.get('/api/backups/config')).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.get('/api/backups/config')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })
})

test.describe('PATCH /api/backups/config', () => {
    test('rejects an anonymous caller', async ({ request }) => {
        expect((await request.patch('/api/backups/config', { data: {} })).status()).toBe(401)
    })

    test('rejects an ordinary department member', async ({ memberPage }) => {
        expect((await memberPage.request.patch('/api/backups/config', { data: {} })).status()).toBe(403)
    })

    test('passes the gate for an authorized caller', async ({ adminPage }) => {
        const res = await adminPage.request.patch('/api/backups/config', { data: {} })
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })

    test('rejects lowering a retention tier', async ({ adminPage }) => {
        const current = await (await adminPage.request.get('/api/backups/config')).json()
        const res = await adminPage.request.patch('/api/backups/config', {
            data: { keepHourly: current.keepHourly - 1 },
        })
        expect(res.status()).toBe(400)
        expect((await res.json()).error).toMatch(/keepHourly/)

        // Nothing was written.
        const after = await (await adminPage.request.get('/api/backups/config')).json()
        expect(after.keepHourly).toBe(current.keepHourly)
    })

    test('accepts raising a retention tier', async ({ adminPage }) => {
        const current = await (await adminPage.request.get('/api/backups/config')).json()
        const res = await adminPage.request.patch('/api/backups/config', {
            data: { keepDaily: current.keepDaily + 1 },
        })
        expect(res.status()).toBe(200)
        expect((await res.json()).keepDaily).toBe(current.keepDaily + 1)
    })

    test('still allows disabling auto-backups', async ({ adminPage }) => {
        const res = await adminPage.request.patch('/api/backups/config', { data: { autoEnabled: false } })
        expect(res.status()).toBe(200)
        expect((await res.json()).autoEnabled).toBe(false)
        // Restore the default so later specs see a normal config.
        await adminPage.request.patch('/api/backups/config', { data: { autoEnabled: true } })
    })
})

/**
 * The manage/restore split (issue #55 requirement 4). The `j4` persona holds
 * `backups.manage` via the seeded J4 base department role but NOT
 * `backups.restore` — it is the only persona that can distinguish the two
 * gates. `override` bypasses both; `j3` holds neither.
 */
test.describe('backups.manage vs backups.restore', () => {
    test('a manage-only holder can read the timeline', async ({ pageAs }) => {
        const page = await pageAs('j4')
        const res = await page.request.get('/api/backups')
        expect(res.status()).not.toBe(403)
        expect(res.status()).not.toBe(401)
    })

    test('a manage-only holder cannot revert', async ({ pageAs }) => {
        const page = await pageAs('j4')
        const res = await page.request.post('/api/backups/revert', { data: { id: '2026-08-17T14:00:00.000Z' } })
        expect(res.status()).toBe(403)
    })

    test('a manage-only holder cannot upload-restore', async ({ pageAs }) => {
        const page = await pageAs('j4')
        expect((await page.request.post('/api/backups/upload')).status()).toBe(403)
    })

    test('a holder of neither key is refused the timeline', async ({ pageAs }) => {
        const page = await pageAs('plainMember')
        expect((await page.request.get('/api/backups')).status()).toBe(403)
    })
})
