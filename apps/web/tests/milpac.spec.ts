/**
 * The MilPac render endpoints.
 *
 * Rendering itself moved out to the `apps/milpac` service, so these specs are
 * deliberately about **who can reach what** rather than about pixels — that is
 * covered by the service's own unit suite and its diff against reference
 * renders. What matters here is that moving the renderer out did not loosen a
 * gate, and that web degrades sanely when the service is not there.
 *
 * Whether a render service is reachable during a run depends on whether one
 * happens to be running locally, so nothing here asserts on render success.
 * Gate assertions are phrased as "not 401/403" rather than a specific success
 * code for the same reason.
 */
import { test, expect } from './fixtures/asot'
import { USERS } from './constants'

/**
 * seed.ts derives a username from the display name, so the routes that look a
 * member up by username need this rather than USERS.x.name — otherwise every
 * assertion below passes as a "member not found" 404 for the wrong reason.
 */
const usernameOf = (user: { name: string }) => user.name.toLowerCase().replace(/\s+/g, '_')
const J3 = usernameOf(USERS.j3)

// ── /api/generate/milpac/[username] — regenerate a member's uniform + box ─────

test.describe('/api/generate/milpac/[username]', () => {

    test('rejects an anonymous caller', async ({ request }) => {
        const res = await request.post(`/api/generate/milpac/${J3}`)
        expect(res.status()).toBe(401)
    })

    /**
     * `memberPage` is the j3 persona, and PERMISSIONS.pages.admin includes
     * 'J3 - Training' — so that persona passes this gate by design. The
     * genuinely ordinary member is plainMember, who holds only 'ASOT Member'.
     */
    test('rejects an ordinary member with no staff role', async ({ pageAs }) => {
        const page = await pageAs('plainMember')
        const res = await page.request.post(`/api/generate/milpac/${J3}`)
        expect(res.status()).toBe(403)
    })

    test('a J3 staffer passes the gate — pages.admin includes their department', async ({ memberPage }) => {
        const res = await memberPage.request.post(`/api/generate/milpac/${J3}`)
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
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
        const res = await adminPage.request.post(`/api/generate/milpac/${J3}`)
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
        const res = await request.get(`/api/milpac/certificate/${J3}?type=award&cert=protagonist`)
        expect(res.status()).toBe(401)
    })

    /**
     * Deliberately open to any logged-in member: certificates are unit records,
     * and the entitlement check below is what stops them being minted freely.
     */
    test('any authenticated member gets past the gate', async ({ memberPage }) => {
        const res = await memberPage.request.get(
            `/api/milpac/certificate/${J3}?type=promotion&cert=PTE`,
        )
        expect(res.status()).not.toBe(401)
        expect(res.status()).not.toBe(403)
    })

    test('an unknown certificate type is rejected before any render', async ({ memberPage }) => {
        const res = await memberPage.request.get(
            `/api/milpac/certificate/${J3}?type=nonsense&cert=protagonist`,
        )
        expect(res.status()).toBe(400)
    })

    test('a missing cert parameter is rejected', async ({ memberPage }) => {
        const res = await memberPage.request.get(`/api/milpac/certificate/${J3}?type=award`)
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
            `/api/milpac/certificate/${J3}?type=award&cert=crossofvalour`,
        )
        expect(res.status()).toBe(404)
    })

    test('refuses a rank that is not the member\'s current one', async ({ memberPage }) => {
        const res = await memberPage.request.get(
            `/api/milpac/certificate/${J3}?type=promotion&cert=GEN`,
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
        // Shape, not value: whether a renderer happens to be reachable depends
        // on whether one is running locally, which is not this spec's business.
        // What matters is that the probe reports rather than throwing or
        // omitting the key when the service is absent.
        expect(typeof body.milpac.online).toBe('boolean')
    })

    test('status still needs authentication', async ({ request }) => {
        expect((await request.get('/api/dashboard/status')).status()).toBe(401)
    })
})
