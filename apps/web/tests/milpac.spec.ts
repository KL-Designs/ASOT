/**
 * The MilPac render endpoints.
 *
 * Rendering itself moved out to the `apps/milpac` service, so these specs are
 * deliberately about **who can reach what** rather than about pixels — that is
 * covered by the service's own unit suite and its diff against reference
 * renders. What matters here is that moving the renderer out did not loosen a
 * gate, and that web degrades sanely when the service is not there.
 *
 * The E2E stack does not run the render service, so any route that actually
 * renders is expected to fail at the *service* step, not the auth step. That is
 * itself the useful assertion: a 502/500 proves the request got past the gate,
 * a 401/403 proves it did not.
 */
import { test, expect } from './fixtures/asot'
import { USERS } from './constants'

// ── /api/generate/milpac/[username] — regenerate a member's uniform + box ─────

test.describe('/api/generate/milpac/[username]', () => {

    test('rejects an anonymous caller', async ({ request }) => {
        const res = await request.post(`/api/generate/milpac/${USERS.j3.name}`)
        expect(res.status()).toBe(401)
    })

    test('rejects an ordinary member', async ({ memberPage }) => {
        const res = await memberPage.request.post(`/api/generate/milpac/${USERS.j3.name}`)
        expect(res.status()).toBe(403)
    })

    /**
     * This route still gates on the legacy `PERMISSIONS.pages.admin` Discord-role
     * array. apps/milpac/PLAN.md Phase 3 called for migrating it to
     * `hasPermission`, and that migration was made and then reverted: the key has
     * not actually migrated, `hasPermission` does not fall back to Discord role
     * names, and it does not carry `hasRoles`' hardcoded J4-Administration
     * bypass — so switching this route alone would have locked it to the OVERRIDE
     * list. This spec pins the working behaviour so that cannot happen silently.
     */
    test('an admin gets past the gate', async ({ adminPage }) => {
        const res = await adminPage.request.post(`/api/generate/milpac/${USERS.j3.name}`)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('a missing member is 404, not a render attempt', async ({ adminPage }) => {
        const res = await adminPage.request.post('/api/generate/milpac/no-such-member')
        expect(res.status()).toBe(404)
    })
})

// ── /api/milpac/certificate/[username] — render a certificate on demand ───────

test.describe('/api/milpac/certificate/[username]', () => {

    test('rejects an anonymous caller', async ({ request }) => {
        const res = await request.get(`/api/milpac/certificate/${USERS.j3.name}?type=award&cert=protagonist`)
        expect(res.status()).toBe(401)
    })

    /**
     * Deliberately open to any logged-in member: certificates are unit records,
     * and the entitlement check below is what stops them being minted freely.
     */
    test('any authenticated member gets past the gate', async ({ memberPage }) => {
        const res = await memberPage.request.get(
            `/api/milpac/certificate/${USERS.j3.name}?type=promotion&cert=PTE`,
        )
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('an unknown certificate type is rejected before any render', async ({ memberPage }) => {
        const res = await memberPage.request.get(
            `/api/milpac/certificate/${USERS.j3.name}?type=nonsense&cert=protagonist`,
        )
        expect(res.status()).toBe(400)
    })

    test('a missing cert parameter is rejected', async ({ memberPage }) => {
        const res = await memberPage.request.get(`/api/milpac/certificate/${USERS.j3.name}?type=award`)
        expect(res.status()).toBe(400)
    })

    /**
     * The entitlement check. Without it this route would render a signed
     * citation naming a real member for any award code a caller guessed, which
     * matters more than a uniform render because the output carries the OC's
     * signature.
     */
    test('refuses an award the member does not hold', async ({ memberPage }) => {
        const res = await memberPage.request.get(
            `/api/milpac/certificate/${USERS.j3.name}?type=award&cert=crossofvalour`,
        )
        expect(res.status()).toBe(404)
    })

    test('refuses a rank that is not the member\'s current one', async ({ memberPage }) => {
        const res = await memberPage.request.get(
            `/api/milpac/certificate/${USERS.j3.name}?type=promotion&cert=GEN`,
        )
        expect(res.status()).toBe(404)
    })

    test('a missing member is 404', async ({ memberPage }) => {
        const res = await memberPage.request.get(
            '/api/milpac/certificate/no-such-member?type=award&cert=protagonist',
        )
        expect(res.status()).toBe(404)
    })
})

// ── /api/milpacs/[name] — serve and upload the stored images ─────────────────

test.describe('/api/milpacs/[name]', () => {

    test('serving an image needs no auth — profiles are public', async ({ request }) => {
        const res = await request.get(`/api/milpacs/${USERS.j3.id}`)
        // 404 because nothing has been rendered in the E2E stack; the point is
        // that it is not 401.
        expect(res.status()).not.toBe(401)
    })

    test('rejects a traversal attempt in the name', async ({ request }) => {
        const res = await request.get('/api/milpacs/..%2F..%2Fpackage.json')
        expect([400, 404]).toContain(res.status())
    })

    test('upload rejects an anonymous caller', async ({ request }) => {
        const res = await request.post(`/api/milpacs/${USERS.j3.id}`, {
            multipart: { type: 'uniform', file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('x') } },
        })
        expect(res.status()).toBe(401)
    })

    test('upload rejects an ordinary member', async ({ memberPage }) => {
        const res = await memberPage.request.post(`/api/milpacs/${USERS.j3.id}`, {
            multipart: { type: 'uniform', file: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('x') } },
        })
        expect(res.status()).toBe(403)
    })
})

// ── Dashboard status ─────────────────────────────────────────────────────────

test.describe('dashboard status includes the renderer', () => {

    test('reports milpac alongside the other services', async ({ adminPage }) => {
        const res = await adminPage.request.get('/api/dashboard/status')
        expect(res.status()).toBe(200)
        const body = await res.json()
        expect(body).toHaveProperty('milpac')
        expect(body.milpac).toHaveProperty('online')
        // The E2E stack runs no render service, so it must report offline
        // rather than throwing or omitting the key.
        expect(body.milpac.online).toBe(false)
    })

    test('status still needs authentication', async ({ request }) => {
        expect((await request.get('/api/dashboard/status')).status()).toBe(401)
    })
})
